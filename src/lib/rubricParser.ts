import Papa from "papaparse";

import type { RubricCriteria } from "@/types";

const DEFAULT_MAX_SCORE = 5;

const SECTION_HEADINGS = new Set([
  "assessment criteria",
  "criteria",
  "evaluation criteria",
  "rubric",
  "rubrics",
  "scoring guide",
  "scoring rubric",
  "scorecard",
]);

const HEADER_TOKENS = new Set([
  "criteria",
  "criterion",
  "description",
  "max",
  "max marks",
  "max points",
  "max score",
  "marks",
  "name",
  "points",
  "score",
  "weight",
]);

const LIST_PREFIX_RE = /^(?:[-*•▪▫◦●]+|\(?\d+[.)]\)?|[A-Za-z][.)])\s+/;

export const RUBRIC_FILE_ACCEPT = ".csv,.pdf,.doc,.docx";

interface CsvRubricRow extends Record<string, unknown> {
  name?: string;
  Name?: string;
  criteria?: string;
  Criteria?: string;
  criterion?: string;
  Criterion?: string;
  description?: string;
  Description?: string;
  desc?: string;
  max?: string;
  Max?: string;
  maxScore?: string;
  max_score?: string;
  "max score"?: string;
  MaxScore?: string;
  points?: string;
  Points?: string;
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().replace(/^['"]|['"]$/g, "");
}

function trimLine(value: string): string {
  return value.replace(/\u00a0/g, " ").trim();
}

function readString(value: unknown): string {
  if (typeof value === "string") {
    return cleanText(value);
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function normalizeKey(value: string): string {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseScoreValue(value: unknown): number | undefined {
  const text = readString(value);

  if (!text) {
    return undefined;
  }

  if (/^\d{1,3}$/.test(text)) {
    const parsed = parseInt(text, 10);
    return parsed > 0 ? parsed : undefined;
  }

  return extractScoreFromText(text).maxScore;
}

function stripListPrefix(value: string): string {
  return cleanText(value.replace(LIST_PREFIX_RE, ""));
}

function isHeaderLike(parts: string[]): boolean {
  if (parts.length === 0) {
    return false;
  }

  return parts.every((part) => {
    const normalized = normalizeKey(part);
    return !normalized || HEADER_TOKENS.has(normalized) || /^\d+$/.test(normalized);
  });
}

function isSectionHeading(value: string): boolean {
  return SECTION_HEADINGS.has(normalizeKey(value));
}

function finalizeRubric(name: string, description?: string, maxScore?: number): RubricCriteria | null {
  const cleanedName = stripListPrefix(name);
  const cleanedDescription = description ? cleanText(description) : "";
  const normalizedName = normalizeKey(cleanedName);

  if (!cleanedName || isSectionHeading(cleanedName) || HEADER_TOKENS.has(normalizedName)) {
    return null;
  }

  return {
    name: cleanedName,
    description: cleanedDescription || undefined,
    maxScore: maxScore && maxScore > 0 ? maxScore : DEFAULT_MAX_SCORE,
  };
}

function normalizeRubrics(rubrics: RubricCriteria[]): RubricCriteria[] {
  const deduped = new Map<string, RubricCriteria>();

  for (const rubric of rubrics) {
    const normalized = finalizeRubric(rubric.name, rubric.description, rubric.maxScore);
    if (!normalized) {
      continue;
    }

    const key = normalizeKey(normalized.name);
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, normalized);
      continue;
    }

    deduped.set(key, {
      name: existing.name,
      description: existing.description || normalized.description,
      maxScore:
        (existing.maxScore ?? DEFAULT_MAX_SCORE) === DEFAULT_MAX_SCORE &&
        (normalized.maxScore ?? DEFAULT_MAX_SCORE) !== DEFAULT_MAX_SCORE
          ? normalized.maxScore
          : existing.maxScore,
    });
  }

  return Array.from(deduped.values());
}

function extractScoreFromText(input: string): { text: string; maxScore?: number } {
  let text = cleanText(input);
  const patterns: Array<{ regex: RegExp; group: number }> = [
    { regex: /\(\s*(\d+)\s*(?:-|–|to)\s*(\d+)\s*\)/i, group: 2 },
    { regex: /\(\s*out of\s*(\d+)\s*\)/i, group: 1 },
    { regex: /\bmax(?:imum)?(?:\s+score|\s+points|\s+marks)?\s*[:-]?\s*(\d+)\b/i, group: 1 },
    { regex: /\/\s*(\d+)\b/i, group: 1 },
    { regex: /\b(\d+)\s*(?:points?|marks?)\b/i, group: 1 },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (!match) {
      continue;
    }

    const parsed = parseInt(match[pattern.group], 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      continue;
    }

    text = cleanText(text.replace(match[0], " "));
    return { text, maxScore: parsed };
  }

  return { text };
}

function parseDelimitedLine(line: string): RubricCriteria | null {
  let parts: string[];

  if (line.includes("|")) {
    parts = line.split(/\s*\|\s*/);
  } else if (line.includes("\t")) {
    parts = line.split(/\t+/);
  } else if (/\s{2,}/.test(line)) {
    parts = line.split(/\s{2,}/);
  } else {
    return null;
  }

  parts = parts.map(cleanText).filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  if (/^\d+$/.test(parts[0]) && parts.length >= 3) {
    parts = parts.slice(1);
  }

  if (isHeaderLike(parts)) {
    return null;
  }

  const lastPart = parts[parts.length - 1];
  const maxScore = parseScoreValue(lastPart);
  const contentParts = maxScore !== undefined && parts.length > 1 ? parts.slice(0, -1) : parts;

  return finalizeRubric(contentParts[0], contentParts.slice(1).join(" - "), maxScore);
}

function looksLikeCriterionName(value: string): boolean {
  const stripped = stripListPrefix(value.replace(/:\s*$/, ""));
  const normalized = normalizeKey(stripped);

  if (!stripped || isSectionHeading(stripped) || HEADER_TOKENS.has(normalized)) {
    return false;
  }

  if (/[.!?]$/.test(stripped)) {
    return false;
  }

  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8 || stripped.length > 80) {
    return false;
  }

  const capitalizedWords = words.filter((word) => /^[A-Z]/.test(word)).length;
  return capitalizedWords >= Math.max(1, Math.ceil(words.length / 2));
}

function parseInlineRubricLine(line: string): RubricCriteria | null {
  const hadListPrefix = LIST_PREFIX_RE.test(line);
  const stripped = stripListPrefix(line);
  if (!stripped || isSectionHeading(stripped)) {
    return null;
  }

  const { text, maxScore } = extractScoreFromText(stripped);
  const structured = text.match(/^(.{2,80}?)(?:\s*:\s+|\s+-\s+|\s+–\s+|\s+—\s+)(.+)$/);
  if (structured) {
    return finalizeRubric(structured[1], structured[2], maxScore);
  }

  if ((hadListPrefix || maxScore !== undefined) && looksLikeCriterionName(text)) {
    return finalizeRubric(text, undefined, maxScore);
  }

  return null;
}

function parsePairedRubric(lines: string[], index: number): { rubric: RubricCriteria; consumeNext: boolean } | null {
  const current = lines[index];
  const next = lines[index + 1];

  if (!next) {
    return null;
  }

  const { text, maxScore } = extractScoreFromText(stripListPrefix(current));
  const title = text.replace(/:\s*$/, "");

  if (!looksLikeCriterionName(title)) {
    return null;
  }

  if (parseDelimitedLine(next) || parseInlineRubricLine(next) || looksLikeCriterionName(next)) {
    return null;
  }

  const rubric = finalizeRubric(title, next, maxScore);
  return rubric ? { rubric, consumeNext: true } : null;
}

export function parseRubricsFromCSVText(csvText: string): RubricCriteria[] {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0].message || "Failed to parse rubrics CSV");
  }

  const rows = parsed.data as CsvRubricRow[];
  const rubrics = rows.map((row) => ({
    name: readString(row.name || row.Name || row.criteria || row.Criteria || row.criterion || row.Criterion || Object.values(row)[0]),
    description: readString(row.description || row.Description || row.desc),
    maxScore:
      parseScoreValue(
        row.maxScore || row.max_score || row["max score"] || row.MaxScore || row.max || row.Max || row.points || row.Points,
      ) ?? DEFAULT_MAX_SCORE,
  }));

  return normalizeRubrics(rubrics);
}

export function extractRubricsFromText(text: string): RubricCriteria[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => trimLine(line))
    .filter(Boolean);

  const rubrics: RubricCriteria[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (isSectionHeading(line)) {
      continue;
    }

    const delimited = parseDelimitedLine(line);
    if (delimited) {
      rubrics.push(delimited);
      continue;
    }

    const paired = parsePairedRubric(lines, index);
    if (paired) {
      rubrics.push(paired.rubric);
      if (paired.consumeNext) {
        index += 1;
      }
      continue;
    }

    const inline = parseInlineRubricLine(line);
    if (inline) {
      rubrics.push(inline);
    }
  }

  return normalizeRubrics(rubrics);
}

export function generateEvaluationPrompt(rubrics: RubricCriteria[], sourceText?: string): string {
  const criteriaList = rubrics
    .map((rubric, index) => {
      const description = rubric.description ? ` - ${rubric.description}` : "";
      return `${index + 1}. **${rubric.name}**${description} (Score: 1-${rubric.maxScore || DEFAULT_MAX_SCORE})`;
    })
    .join("\n");

  const rubricContext = cleanText(sourceText || "");
  const contextSection = rubricContext
    ? `\nAdditional rubric context from the uploaded file:\n${rubricContext.slice(0, 3000)}\n`
    : "";

  return `You are an expert video evaluator. Evaluate the following 30-second video clip based on these rubric criteria:

You will be provided with:
1. The transcript of spoken content in this 30-second clip
2. A screenshot captured from the middle of this clip

${criteriaList}
${contextSection}
For each criterion, consider BOTH the transcript (spoken content, keywords, discussion topics) AND the screenshot (visual elements, presentation style, engagement indicators, body language if visible, slides/content being shown).

Provide a numeric score within the specified range AND a very brief explanation (one short sentence max) for why that score was given. Be concise — mention only the key reason for the score. Be fair, objective, and consistent.

Respond ONLY with a valid JSON object in this exact format:
{
  "scores": {
${rubrics.map((rubric) => `    "${rubric.name}": <score>`).join(",\n")}
  },
  "descriptions": {
${rubrics.map((rubric) => `    "${rubric.name}": "<one short sentence>"`).join(",\n")}
  }
}

Do not include any text outside the JSON object.`;
}
