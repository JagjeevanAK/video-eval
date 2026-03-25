import Papa from "papaparse";

import type { RubricCriteria } from "@/types";

interface CsvRubricRow extends Record<string, unknown> {
  name?: string;
  Name?: string;
  criteria?: string;
  Criteria?: string;
  description?: string;
  Description?: string;
  desc?: string;
  maxScore?: string;
  max_score?: string;
  MaxScore?: string;
}

function readString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

export function parseRubricsFromCSV(file: File): Promise<RubricCriteria[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = results.data as CsvRubricRow[];
          const rubrics: RubricCriteria[] = rows.map((row) => ({
            name: readString(row.name || row.Name || row.criteria || row.Criteria || Object.values(row)[0]),
            description: readString(row.description || row.Description || row.desc),
            maxScore: parseInt(readString(row.maxScore || row.max_score || row.MaxScore || "5"), 10) || 5,
          }));

          resolve(rubrics.filter((rubric) => rubric.name));
        } catch {
          reject(new Error("Failed to parse rubrics file"));
        }
      },
      error: (err) => reject(err),
    });
  });
}

export function generateEvaluationPrompt(rubrics: RubricCriteria[]): string {
  const criteriaList = rubrics
    .map((r, i) => `${i + 1}. **${r.name}**${r.description ? ` - ${r.description}` : ""} (Score: 1-${r.maxScore || 5})`)
    .join("\n");

  return `You are an expert video evaluator. Evaluate the following video transcript/content based on these rubric criteria:

${criteriaList}

For each criterion, provide a numeric score within the specified range. Be fair, objective, and consistent.

Respond ONLY with a valid JSON object in this exact format:
{
${rubrics.map((r) => `  "${r.name}": <score>`).join(",\n")}
}

Do not include any text outside the JSON object.`;
}
