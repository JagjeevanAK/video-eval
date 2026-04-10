import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import { NextResponse } from "next/server";

import { extractRubricsFromText, parseRubricsFromCSVText } from "@/lib/rubricParser";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const SUPPORTED_EXTENSIONS = new Set(["csv", "doc", "docx", "pdf"]);

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replaceAll("\0", " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getFileExtension(fileName: string): string {
  return extname(fileName).replace(/^\./, "").toLowerCase();
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  logger.info("PDF2JSON", "Starting PDF extraction", { bufferLength: buffer.length });

  const PDFParser = (await import("pdf2json")).default;
  const pdfParser = new PDFParser();

  const text = await new Promise<string>((resolve, reject) => {
    pdfParser.on("pdfParser_dataError", (err) => {
      logger.error("PDF2JSON", "Data error", err);
      reject(err);
    });
    pdfParser.on("pdfParser_dataReady", () => {
      logger.info("PDF2JSON", "Data ready, attempting raw text extraction");
      const extracted = pdfParser.getRawTextContent();
      logger.info("PDF2JSON", "Raw text length", { length: extracted?.length });
      resolve(extracted || "");
    });
    pdfParser.parseBuffer(buffer);
  });

  logger.info("PDF2JSON", "Final extracted text length", { length: text.length });

  if (text.length > 0) {
    return normalizeExtractedText(text);
  }

  // No text extracted - PDF likely contains images (screenshots/scans)
  // Use OCR to extract text
  logger.info("PDF OCR", "No text layer found, starting OCR extraction");
  return extractTextFromPdfWithOCR(buffer);
}

async function extractTextFromPdfWithOCR(buffer: Buffer): Promise<string> {
  const tempDir = tmpdir();
  const pdfPath = join(tempDir, `ocr-${crypto.randomUUID()}.pdf`);
  const outputDir = join(tempDir, `ocr-pages-${crypto.randomUUID()}`);

  try {
    // Write PDF to temp file
    await fs.writeFile(pdfPath, buffer);
    await fs.mkdir(outputDir, { recursive: true });

    // Convert PDF pages to images using pdftoppm (from poppler-utils)
    logger.info("PDF OCR", "Converting PDF to images");
    const { exec } = await import("node:child_process");
    const convertResult = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      exec(
        `pdftoppm -png -r 300 "${pdfPath}" "${join(outputDir, "page")}"`,
        (error, stdout, stderr) => {
          if (error) {
            logger.error("PDF OCR", "pdftoppm error", { message: error.message });
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        },
      );
    });
    logger.info("PDF OCR", "pdftoppm completed", { stderr: convertResult.stderr });

    // Read all generated page images
    const files = await fs.readdir(outputDir);
    const pageImages = files
      .filter((f) => f.endsWith(".png"))
      .sort()
      .map((f) => join(outputDir, f));

    logger.info("PDF OCR", "Converted PDF to images", { count: pageImages.length });

    if (pageImages.length === 0) {
      logger.warn("PDF OCR", "No images generated from PDF");
      return "";
    }

    // Check image file sizes
    for (const img of pageImages) {
      const stats = await fs.stat(img);
      logger.debug("PDF OCR", "Image file size", { image: img, size: stats.size });
    }

    // Run OCR on each page using tesseract CLI
    const pageTexts: string[] = [];

    for (let i = 0; i < pageImages.length; i++) {
      logger.info("PDF OCR", "Processing page", { page: i + 1, total: pageImages.length });
      const imagePath = pageImages[i];
      const outputPath = imagePath.replace(".png", "");

      // Preprocess image: convert to grayscale, increase contrast, and threshold
      const sharp = (await import("sharp")).default;
      const processedImagePath = imagePath.replace(".png", "-processed.png");
      await sharp(imagePath)
        .grayscale()
        .normalize()
        .threshold(128)
        .toFile(processedImagePath);

      const processedStats = await fs.stat(processedImagePath);
      console.log(`[PDF OCR] Processed image size: ${processedStats.size} bytes`);

      // Run tesseract directly
      const tesseractResult = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        exec(
          `tesseract "${processedImagePath}" "${outputPath}" -l eng --psm 6`,
          (error, stdout, stderr) => {
            if (error) {
              logger.error("PDF OCR", "Tesseract error on page", { page: i + 1, message: error.message });
              reject(error);
            } else {
              resolve({ stdout, stderr });
            }
          },
        );
      });
      logger.debug("PDF OCR", "Tesseract page completed", { page: i + 1, stderr: tesseractResult.stderr });

      // Read the extracted text file
      const textFilePath = `${outputPath}.txt`;
      const textFileExists = await fs.access(textFilePath).then(() => true).catch(() => false);
      logger.debug("PDF OCR", "Text file status", { page: i + 1, exists: textFileExists, path: textFilePath });

      if (!textFileExists) {
        logger.error("PDF OCR", "Text file not created for page", { page: i + 1 });
        continue;
      }

      const text = await fs.readFile(textFilePath, "utf-8");
      logger.debug("PDF OCR", "Page text extracted", { page: i + 1, length: text.length });
      if (text.length < 100) {
        logger.debug("PDF OCR", "Page text preview", { page: i + 1, preview: text.substring(0, 100) });
      }
      pageTexts.push(text);
    }

    const combinedText = pageTexts.join("\n\n");
    logger.info("PDF OCR", "Total OCR text extracted", { length: combinedText.length });

    return normalizeExtractedText(combinedText);
  } finally {
    // Clean up temp files
    await fs.rm(pdfPath, { force: true }).catch(() => undefined);
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return normalizeExtractedText(result.value);
}

function extractTextFromLegacyWordBuffer(buffer: Buffer): string {
  const asciiRuns = buffer.toString("latin1").match(/[A-Za-z0-9][ -~]{3,}/g) || [];
  const utf16Runs = buffer.toString("utf16le").match(/[A-Za-z0-9][ -~]{3,}/g) || [];

  return normalizeExtractedText(
    [...asciiRuns, ...utf16Runs]
      .map((fragment) => fragment.replace(/\s+/g, " ").trim())
      .filter((fragment) => fragment.length > 4)
      .join("\n"),
  );
}

async function extractTextFromDoc(buffer: Buffer, fileName: string): Promise<string> {
  const tempPath = join(tmpdir(), `rubric-${crypto.randomUUID()}-${sanitizeFileName(fileName || "rubric.doc")}`);

  try {
    const wordExtractorModule = await import("word-extractor");
    const WordExtractor = wordExtractorModule.default;
    const extractor = new WordExtractor();

    await fs.writeFile(tempPath, buffer);
    const document = await extractor.extract(tempPath);
    return normalizeExtractedText(document.getBody());
  } catch {
    return extractTextFromLegacyWordBuffer(buffer);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

async function extractTextFromFile(extension: string, buffer: Buffer, fileName: string): Promise<string> {
  switch (extension) {
    case "pdf":
      return extractTextFromPdf(buffer);
    case "docx":
      return extractTextFromDocx(buffer);
    case "doc":
      return extractTextFromDoc(buffer, fileName);
    default:
      throw new Error(`Unsupported rubric file type: .${extension}`);
  }
}

export async function POST(request: Request) {
  try {
    logger.info("RubricParse", "POST request received");
    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      logger.warn("RubricParse", "No file provided");
      return NextResponse.json({ error: "A rubric file is required." }, { status: 400 });
    }

    const extension = getFileExtension(fileEntry.name);
    logger.info("RubricParse", "File extension detected", { extension });

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: "Unsupported rubric format. Upload a CSV, PDF, DOC, or DOCX file." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    logger.info("RubricParse", "Buffer size", { size: buffer.length });

    if (extension === "csv") {
      const csvText = buffer.toString("utf8");
      const rubrics = parseRubricsFromCSVText(csvText);

      if (rubrics.length === 0) {
        logger.warn("RubricParse", "No rubric criteria found in CSV");
        return NextResponse.json(
          { error: "No rubric criteria were found in the CSV. Include a name column or a first column with criterion names." },
          { status: 422 },
        );
      }

      logger.info("RubricParse", "CSV rubric parsed", { count: rubrics.length });
      return NextResponse.json({ rubrics });
    }

    logger.info("RubricParse", "Extracting text from file");
    const sourceText = await extractTextFromFile(extension, buffer, fileEntry.name);
    logger.info("RubricParse", "Source text extracted", { length: sourceText.length });

    logger.info("RubricParse", "Extracting rubrics from text");
    const rubrics = extractRubricsFromText(sourceText);
    logger.info("RubricParse", "Rubrics extracted", { count: rubrics.length });

    if (rubrics.length === 0) {
      logger.warn("RubricParse", "No rubric criteria extracted");
      return NextResponse.json(
        {
          error:
            "No rubric criteria were extracted from the document. Use a table or bullet list with criterion names and optional score ranges.",
        },
        { status: 422 },
      );
    }

    logger.info("RubricParse", "Rubric parsing completed successfully", { rubricCount: rubrics.length });
    return NextResponse.json({
      rubrics,
      sourceText: sourceText.slice(0, 6000),
    });
  } catch (error) {
    logger.error("RubricParse", "Error during rubric parsing", error);
    const message = error instanceof Error ? error.message : "Failed to parse rubric file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
