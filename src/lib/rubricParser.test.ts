import { describe, expect, it } from "vitest";

import { extractRubricsFromText, generateEvaluationPrompt, parseRubricsFromCSVText } from "@/lib/rubricParser";

describe("parseRubricsFromCSVText", () => {
  it("maps csv columns to normalized rubrics", () => {
    const rubrics = parseRubricsFromCSVText(`name,description,maxScore
Communication,Clarity and confidence,10
Technical Depth,,5
`);

    expect(rubrics).toEqual([
      { name: "Communication", description: "Clarity and confidence", maxScore: 10 },
      { name: "Technical Depth", description: undefined, maxScore: 5 },
    ]);
  });
});

describe("extractRubricsFromText", () => {
  it("extracts rubric rows from document-like tables", () => {
    const rubrics = extractRubricsFromText(`
Rubrics
Name | Description | Max Score
Communication | Clarity and confidence | 5
Technical Depth | Problem solving and tradeoffs | 10
`);

    expect(rubrics).toEqual([
      { name: "Communication", description: "Clarity and confidence", maxScore: 5 },
      { name: "Technical Depth", description: "Problem solving and tradeoffs", maxScore: 10 },
    ]);
  });

  it("extracts rubric rows from pdf-style whitespace tables", () => {
    const rubrics = extractRubricsFromText(`
Communication    Clarity and confidence    5
Technical Depth    Problem solving and tradeoffs    10
`);

    expect(rubrics).toEqual([
      { name: "Communication", description: "Clarity and confidence", maxScore: 5 },
      { name: "Technical Depth", description: "Problem solving and tradeoffs", maxScore: 10 },
    ]);
  });

  it("extracts rubric bullets with inline score ranges", () => {
    const rubrics = extractRubricsFromText(`
1. Communication - Clear and concise answers (1-5)
2. Technical Depth: Demonstrates strong fundamentals /10
`);

    expect(rubrics).toEqual([
      { name: "Communication", description: "Clear and concise answers", maxScore: 5 },
      { name: "Technical Depth", description: "Demonstrates strong fundamentals", maxScore: 10 },
    ]);
  });
});

describe("generateEvaluationPrompt", () => {
  it("includes each rubric and enforces a JSON-only response with scores and descriptions", () => {
    const prompt = generateEvaluationPrompt(
      [
        { name: "Communication", description: "Clarity and confidence", maxScore: 10 },
        { name: "Technical Depth", maxScore: 5 },
      ],
      "Detailed anchors: 1 is poor, 5 is excellent.",
    );

    expect(prompt).toContain("Communication");
    expect(prompt).toContain("Technical Depth");
    expect(prompt).toContain('"scores"');
    expect(prompt).toContain('"descriptions"');
    expect(prompt).toContain("\"Communication\": <score>");
    expect(prompt).toContain("\"Technical Depth\": <score>");
    expect(prompt).toContain("\"Communication\": \"<brief explanation>\"");
    expect(prompt).toContain("Additional rubric context");
    expect(prompt).toContain("Respond ONLY with a valid JSON object");
    expect(prompt).toContain("concise explanation");
  });
});
