import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

describe("issueSelectionOpenAi", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the queue item selected by the OpenAI response", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                selectedQueueKey: "project:evolvo-web#5",
                rationale: "Active project work should take precedence.",
              }),
            },
          ],
        },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const { selectIssueForWorkWithOpenAi } = await import("./issueSelectionOpenAi.js");
    const result = await selectIssueForWorkWithOpenAi({
      apiKey: "test-key",
      activeProjectSlug: "evolvo-web",
      issues: [
        {
          number: 5,
          title: "Homepage shell",
          description: "Build the shared shell.",
          state: "open",
          labels: [],
          queueKey: "project:evolvo-web#5",
          sourceKind: "project-repo",
          projectSlug: "evolvo-web",
          repository: {
            owner: "evolvo-auto",
            repo: "evolvo-web",
            url: "https://github.com/evolvo-auto/evolvo-web",
            reference: "evolvo-auto/evolvo-web",
          },
          project: null,
        },
        {
          number: 400,
          title: "Planner robustness",
          description: "Improve planner retries.",
          state: "open",
          labels: [],
          queueKey: "tracker:evolvo-ts#400",
          sourceKind: "tracker",
          projectSlug: null,
          repository: {
            owner: "evolvo-auto",
            repo: "evolvo-ts",
            url: "https://github.com/evolvo-auto/evolvo-ts",
            reference: "evolvo-auto/evolvo-ts",
          },
          project: null,
        },
      ],
    });

    expect(result.selectedIssue?.queueKey).toBe("project:evolvo-web#5");
    expect(result.rationale).toBe("Active project work should take precedence.");
  });

  it("falls back to host prioritization when the API response is invalid", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                selectedQueueKey: "unknown-key",
                rationale: "bad key",
              }),
            },
          ],
        },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const { selectIssueForWorkWithOpenAi } = await import("./issueSelectionOpenAi.js");
    const result = await selectIssueForWorkWithOpenAi({
      apiKey: "test-key",
      activeProjectSlug: "evolvo-web",
      issues: [
        {
          number: 5,
          title: "Homepage shell",
          description: "Build the shared shell.",
          state: "open",
          labels: [],
          queueKey: "project:evolvo-web#5",
          sourceKind: "project-repo",
          projectSlug: "evolvo-web",
          repository: {
            owner: "evolvo-auto",
            repo: "evolvo-web",
            url: "https://github.com/evolvo-auto/evolvo-web",
            reference: "evolvo-auto/evolvo-web",
          },
          project: null,
        },
        {
          number: 400,
          title: "Planner robustness",
          description: "Improve planner retries.",
          state: "open",
          labels: [],
          queueKey: "tracker:evolvo-ts#400",
          sourceKind: "tracker",
          projectSlug: null,
          repository: {
            owner: "evolvo-auto",
            repo: "evolvo-ts",
            url: "https://github.com/evolvo-auto/evolvo-ts",
            reference: "evolvo-auto/evolvo-ts",
          },
          project: null,
        },
      ],
    });

    expect(result.selectedIssue?.queueKey).toBe("project:evolvo-web#5");
    expect(result.rationale).toContain("active project issues take precedence");
  });
});
