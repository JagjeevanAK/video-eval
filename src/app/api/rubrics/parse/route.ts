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
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = (textContent.items as Array<{ str?: string }>).map((item) => item.str || "").join(" ");
    pages.push(pageText);
  }

  return normalizeExtractedText(pages.join("\n"));
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
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: "Unsupported rubric format. Upload a CSV, PDF, DOC, or DOCX file." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await fileEntry.arrayBuffer());

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

    const sourceText = await extractTextFromFile(extension, buffer, fileEntry.name);
    const rubrics = extractRubricsFromText(sourceText);

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
    const message = error instanceof Error ? error.message : "Failed to parse rubric file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
