import { describe, expect, it } from "vitest";
import { buildReviewPrompt, parseReviewResponse } from "./reviewAgent.js";

describe("buildReviewPrompt", () => {
  it("includes the strict stage ownership and review evidence", () => {
    const prompt = buildReviewPrompt({
      apiKey: "test",
      workDir: "/tmp/repo",
      issue: {
        number: 12,
        title: "Improve planner safety",
        description: "Tighten planner retry semantics.",
      },
      pullRequestUrl: "https://github.com/Evolvo-org/evolvo-ts/pull/12",
      validationCommands: [
        { command: "pnpm test", commandName: "pnpm", exitCode: 0, durationMs: 1000 },
      ],
      failedValidationCommands: [],
      implementationSummary: "Implemented retry classification changes.",
      defaultBranch: "main",
      diffStat: " src/main.ts | 10 +++++-----",
      diff: "diff --git a/src/main.ts b/src/main.ts",
    });

    expect(prompt).toContain("You are Evolvo's Review agent.");
    expect(prompt).toContain("Only the Review agent may move work from Ready for Review to In Review");
    expect(prompt).toContain("Issue #12: Improve planner safety");
    expect(prompt).toContain("https://github.com/Evolvo-org/evolvo-ts/pull/12");
    expect(prompt).toContain("pnpm test");
  });
});

describe("parseReviewResponse", () => {
  it("parses a valid approve response", () => {
    expect(
      parseReviewResponse(JSON.stringify({
        decision: "approve",
        summary: "Looks good.",
        reasons: ["Validation passed."],
      })),
    ).toEqual({
      decision: "approve",
      summary: "Looks good.",
      reasons: ["Validation passed."],
      finalResponse: JSON.stringify({
        decision: "approve",
        summary: "Looks good.",
        reasons: ["Validation passed."],
      }),
    });
  });

  it("throws when the response is missing a valid decision", () => {
    expect(() => parseReviewResponse(JSON.stringify({
      decision: "maybe",
      summary: "Unsure.",
      reasons: [],
    }))).toThrow("valid decision");
  });
});
