import { afterEach, describe, expect, it, vi } from "vitest";
import { runPlanningStageAgent } from "./planningStageAgent.js";

describe("runPlanningStageAgent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns planner actions from the Responses API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          actions: [
            {
              issueNumber: 14,
              decision: "ready-for-dev",
              title: "Implement stage-aware scheduler",
              description: "Replace the old issue loop with board-stage scheduling.",
              splitIssues: [
                {
                  title: "Add scheduler metrics",
                  description: "Track per-agent stage throughput.",
                },
              ],
              reasons: ["The issue is implementation-ready after being tightened."],
            },
          ],
        }),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPlanningStageAgent({
      apiKey: "test-key",
      projectSlug: "evolvo",
      projectDisplayName: "Evolvo",
      repository: "Evolvo-org/evolvo-ts",
      maxIssues: 10,
      planningIssues: [
        {
          number: 14,
          title: "Scheduler",
          description: "Make it better",
          stage: "Inbox",
        },
      ],
      openIssueTitles: [],
      recentClosedIssueTitles: [],
    });

    expect(result).toEqual([
      {
        issueNumber: 14,
        decision: "ready-for-dev",
        title: "Implement stage-aware scheduler",
        description: "Replace the old issue loop with board-stage scheduling.",
        splitIssues: [
          {
            title: "Add scheduler metrics",
            description: "Track per-agent stage throughput.",
          },
        ],
        reasons: ["The issue is implementation-ready after being tightened."],
      },
    ]);
  });

  it("parses assistant output from the output message content when output_text is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  actions: [
                    {
                      issueNumber: 21,
                      decision: "blocked",
                      title: "Clarify release-stage board transitions",
                      description: "The issue depends on unresolved release ownership and should be blocked.",
                      splitIssues: [],
                      reasons: ["Release ownership is still undefined."],
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runPlanningStageAgent({
      apiKey: "test-key",
      projectSlug: "evolvo",
      projectDisplayName: "Evolvo",
      repository: "Evolvo-org/evolvo-ts",
      maxIssues: 10,
      planningIssues: [
        {
          number: 21,
          title: "Release stage transitions",
          description: "Need to define this properly",
          stage: "Planning",
        },
      ],
      openIssueTitles: [],
      recentClosedIssueTitles: [],
    });

    expect(result).toEqual([
      {
        issueNumber: 21,
        decision: "blocked",
        title: "Clarify release-stage board transitions",
        description: "The issue depends on unresolved release ownership and should be blocked.",
        splitIssues: [],
        reasons: ["Release ownership is still undefined."],
      },
    ]);
  });
});
