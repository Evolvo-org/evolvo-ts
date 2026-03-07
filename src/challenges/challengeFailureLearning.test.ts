import { describe, expect, it, vi } from "vitest";
import type { CodingAgentRunResult } from "../agents/runCodingAgent.js";
import {
  buildChallengeFailureLearningComment,
  classifyChallengeFailure,
  createCorrectiveIssuesForChallengeFailure,
} from "./challengeFailureLearning.js";

function createRunResult(overrides: Partial<CodingAgentRunResult["summary"]>): CodingAgentRunResult {
  return {
    mergedPullRequest: false,
    summary: {
      inspectedAreas: [],
      editedFiles: ["src/main.ts"],
      validationCommands: [],
      failedValidationCommands: [],
      reviewOutcome: "accepted",
      pullRequestCreated: false,
      externalRepositories: [],
      externalPullRequests: [],
      mergedExternalPullRequest: false,
      finalResponse: "",
      ...overrides,
    },
  };
}

describe("challengeFailureLearning", () => {
  it("classifies validation failures from run result", () => {
    const category = classifyChallengeFailure(
      null,
      createRunResult({
        failedValidationCommands: [{ command: "pnpm test", exitCode: 1, durationMs: 100 }],
        reviewOutcome: "amended",
      }),
    );

    expect(category).toBe("validation_failure");
  });

  it("classifies workflow failures from runtime error message", () => {
    const category = classifyChallengeFailure(new Error("Could not merge pull request"), null);
    expect(category).toBe("workflow_failure");
  });

  it("classifies scope-control failures when no files were edited", () => {
    const category = classifyChallengeFailure(
      null,
      createRunResult({ editedFiles: [], reviewOutcome: "amended" }),
    );

    expect(category).toBe("scope_control_failure");
  });

  it("creates corrective issues with challenge linkage in body", async () => {
    const createIssue = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        message: "Created issue #201.",
        issue: { number: 201, title: "A", description: "", state: "open", labels: [] },
      })
      .mockResolvedValueOnce({
        ok: true,
        message: "Created issue #202.",
        issue: { number: 202, title: "B", description: "", state: "open", labels: [] },
      });

    const created = await createCorrectiveIssuesForChallengeFailure(
      { createIssue } as never,
      46,
      "validation_failure",
    );

    expect(created.map((issue) => issue.number)).toEqual([201, 202]);
    expect(createIssue).toHaveBeenCalledTimes(2);
    expect(createIssue).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.stringContaining("Relates-to-Challenge: #46"),
    );
    expect(createIssue).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.stringContaining("Challenge-Failure-Category: validation_failure"),
    );
  });

  it("formats a learning comment with generated issue links", () => {
    const comment = buildChallengeFailureLearningComment({
      challengeIssueNumber: 46,
      category: "execution_failure",
      correctiveIssues: [
        { number: 301, title: "Fix A", description: "", state: "open", labels: [] },
      ],
    });

    expect(comment).toContain("Failure classification: `execution_failure`");
    expect(comment).toContain("#301 Fix A");
  });
});
