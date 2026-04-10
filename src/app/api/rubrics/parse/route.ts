import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import { NextResponse } from "next/server";

import { extractRubricsFromText, parseRubricsFromCSVText } from "@/lib/rubricParser";

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
  console.log("[PDF2JSON] Starting PDF extraction, buffer length:", buffer.length);

  const PDFParser = (await import("pdf2json")).default;
  const pdfParser = new PDFParser();

  const text = await new Promise<string>((resolve, reject) => {
    pdfParser.on("pdfParser_dataError", (err) => {
      console.error("[PDF2JSON] Data error:", err);
      reject(err);
    });
    pdfParser.on("pdfParser_dataReady", () => {
      console.log("[PDF2JSON] Data ready, attempting raw text extraction");
      const extracted = pdfParser.getRawTextContent();
      console.log("[PDF2JSON] Raw text length:", extracted?.length);
      resolve(extracted || "");
    });
    pdfParser.parseBuffer(buffer);
  });

  console.log("[PDF2JSON] Final extracted text length:", text.length);

  if (text.length > 0) {
    return normalizeExtractedText(text);
  }

  // No text extracted - PDF likely contains images (screenshots/scans)
  // Use OCR to extract text
  console.log("[PDF OCR] No text layer found, starting OCR extraction...");
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
    console.log("[PDF OCR] Converting PDF to images...");
    const { exec } = await import("node:child_process");
    const convertResult = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      exec(
        `pdftoppm -png -r 300 "${pdfPath}" "${join(outputDir, "page")}"`,
        (error, stdout, stderr) => {
          if (error) {
            console.error("[PDF OCR] pdftoppm error:", error.message);
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        },
      );
    });
    console.log("[PDF OCR] pdftoppm completed. stderr:", convertResult.stderr);

    // Read all generated page images
    const files = await fs.readdir(outputDir);
    const pageImages = files
      .filter((f) => f.endsWith(".png"))
      .sort()
      .map((f) => join(outputDir, f));

    console.log("[PDF OCR] Converted PDF to", pageImages.length, "images");

    if (pageImages.length === 0) {
      console.log("[PDF OCR] No images generated from PDF");
      return "";
    }

    // Check image file sizes
    for (const img of pageImages) {
      const stats = await fs.stat(img);
      console.log(`[PDF OCR] Image ${img} size: ${stats.size} bytes`);
    }

    // Run OCR on each page using tesseract CLI
    const pageTexts: string[] = [];

    for (let i = 0; i < pageImages.length; i++) {
      console.log(`[PDF OCR] Processing page ${i + 1}/${pageImages.length}...`);
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
              console.error(`[PDF OCR] Tesseract error on page ${i + 1}:`, error.message);
              reject(error);
            } else {
              resolve({ stdout, stderr });
            }
          },
        );
      });
      console.log(`[PDF OCR] Tesseract page ${i + 1} stderr:`, tesseractResult.stderr);

      // Read the extracted text file
      const textFilePath = `${outputPath}.txt`;
      const textFileExists = await fs.access(textFilePath).then(() => true).catch(() => false);
      console.log(`[PDF OCR] Text file exists: ${textFileExists}`, textFilePath);

      if (!textFileExists) {
        console.error(`[PDF OCR] Text file not created for page ${i + 1}`);
        continue;
      }

      const text = await fs.readFile(textFilePath, "utf-8");
      console.log(`[PDF OCR] Page ${i + 1} extracted ${text.length} characters`);
      if (text.length < 100) {
        console.log(`[PDF OCR] Page ${i + 1} first 100 chars:`, text.substring(0, 100));
      }
      pageTexts.push(text);
    }

    const combinedText = pageTexts.join("\n\n");
    console.log("[PDF OCR] Total OCR text extracted:", combinedText.length);

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
    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "A rubric file is required." }, { status: 400 });
    }

    const extension = getFileExtension(fileEntry.name);
    console.log("[PDF Parse] File extension:", extension);

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: "Unsupported rubric format. Upload a CSV, PDF, DOC, or DOCX file." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    console.log("[PDF Parse] Buffer size:", buffer.length);

    if (extension === "csv") {
      const csvText = buffer.toString("utf8");
      const rubrics = parseRubricsFromCSVText(csvText);

      if (rubrics.length === 0) {
        return NextResponse.json(
          { error: "No rubric criteria were found in the CSV. Include a name column or a first column with criterion names." },
          { status: 422 },
        );
      }

      return NextResponse.json({ rubrics });
    }

    console.log("[PDF Parse] Extracting text from file...");
    const sourceText = await extractTextFromFile(extension, buffer, fileEntry.name);
    console.log("[PDF Parse] Source text extracted, length:", sourceText.length);

    console.log("[PDF Parse] Extracting rubrics from text...");
    const rubrics = extractRubricsFromText(sourceText);
    console.log("[PDF Parse] Rubrics extracted:", rubrics.length);

    if (rubrics.length === 0) {
      return NextResponse.json(
        {
          error:
            "No rubric criteria were extracted from the document. Use a table or bullet list with criterion names and optional score ranges.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      rubrics,
      sourceText: sourceText.slice(0, 6000),
    });
  } catch (error) {
    console.error("[PDF Parse] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to parse rubric file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
