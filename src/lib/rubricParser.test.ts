import { describe, expect, it } from "vitest";

import { generateEvaluationPrompt } from "@/lib/rubricParser";

describe("generateEvaluationPrompt", () => {
  it("includes each rubric and enforces a JSON-only response", () => {
    const prompt = generateEvaluationPrompt([
      { name: "Communication", description: "Clarity and confidence", maxScore: 10 },
      { name: "Technical Depth", maxScore: 5 },
    ]);

    expect(prompt).toContain("Communication");
    expect(prompt).toContain("Technical Depth");
    expect(prompt).toContain("\"Communication\": <score>");
    expect(prompt).toContain("\"Technical Depth\": <score>");
    expect(prompt).toContain("Respond ONLY with a valid JSON object");
  });
});
