import { describe, expect, it, vi } from "vitest";
import { GitHubProjectsV2Client } from "./githubProjectsV2.js";
import { createDefaultProjectWorkflow } from "../projects/projectWorkflow.js";
import type { ProjectRecord } from "../projects/projectRegistry.js";

function createProject(owner = "evolvo-auto"): ProjectRecord {
  return {
    slug: "habit-cli",
    displayName: "Habit CLI",
    kind: "managed",
    issueLabel: "project:habit-cli",
    trackerRepo: {
      owner,
      repo: "evolvo-ts",
      url: `https://github.com/${owner}/evolvo-ts`,
    },
    executionRepo: {
      owner,
      repo: "habit-cli",
      url: `https://github.com/${owner}/habit-cli`,
      defaultBranch: "main",
    },
    cwd: "/tmp/habit-cli",
    status: "active",
    sourceIssueNumber: 25,
    createdAt: "2026-03-08T10:00:00.000Z",
    updatedAt: "2026-03-08T10:00:00.000Z",
    provisioning: {
      labelCreated: true,
      repoCreated: true,
        workspacePrepared: true,
        lastError: null,
      },
    workflow: createDefaultProjectWorkflow(owner),
  };
}

describe("GitHubProjectsV2Client", () => {
  it("returns existing board metadata when the board and stage field already exist", async () => {
    const graphql = vi.fn()
      .mockResolvedValueOnce({
        organization: {
          id: "owner-id",
          login: "evolvo-auto",
          __typename: "Organization",
          projectsV2: {
            nodes: [
              {
                id: "project-id",
                number: 7,
                repositories: {
                  nodes: [
                    { nameWithOwner: "evolvo-auto/habit-cli" },
                  ],
                },
                title: "habit-cli Workflow",
                url: "https://github.com/orgs/evolvo-auto/projects/7",
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          id: "repo-id",
        },
      })
      .mockResolvedValueOnce({
        organization: {
          projectV2: {
            fields: {
              nodes: [
                {
                  id: "stage-field-id",
                  name: "Stage",
                  options: [
                    { id: "opt-inbox", name: "Inbox" },
                    { id: "opt-ready", name: "Ready for Dev" },
                  ],
                },
              ],
            },
          },
        },
        user: null,
      });

    const client = new GitHubProjectsV2Client({ graphql } as never);

    const result = await client.ensureProjectBoard(createProject());

    expect(result.workflow).toEqual(
      expect.objectContaining({
        boardOwner: "evolvo-auto",
        boardNumber: 7,
        boardId: "project-id",
        boardUrl: "https://github.com/orgs/evolvo-auto/projects/7",
        stageFieldId: "stage-field-id",
        boardProvisioned: true,
        stageOptionIds: expect.objectContaining({
          Inbox: "opt-inbox",
          "Ready for Dev": "opt-ready",
        }),
      }),
    );
    expect(graphql).toHaveBeenCalledTimes(3);
  });

  it("creates the board and stage field when they are missing", async () => {
    const graphql = vi.fn()
      .mockResolvedValueOnce({
        organization: {
          id: "owner-id",
          login: "evolvo-auto",
          __typename: "Organization",
          projectsV2: { nodes: [] },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          id: "repo-id",
        },
      })
      .mockResolvedValueOnce({
        createProjectV2: {
          projectV2: {
            id: "project-id",
            number: 12,
            url: "https://github.com/orgs/evolvo-auto/projects/12",
          },
        },
      })
      .mockResolvedValueOnce({
        organization: {
          projectV2: {
            fields: { nodes: [] },
          },
        },
      })
      .mockResolvedValueOnce({
        createProjectV2Field: {
          projectV2Field: {
            id: "stage-field-id",
            name: "Stage",
            options: [
              { id: "opt-inbox", name: "Inbox" },
              { id: "opt-planning", name: "Planning" },
            ],
          },
        },
      });

    const client = new GitHubProjectsV2Client({ graphql } as never);

    const result = await client.ensureProjectBoard(createProject());

    expect(result.workflow.boardNumber).toBe(12);
    expect(result.workflow.stageFieldId).toBe("stage-field-id");
    expect(result.workflow.stageOptionIds.Inbox).toBe("opt-inbox");
    expect(result.workflow.boardProvisioned).toBe(true);
    expect(graphql).toHaveBeenCalledTimes(5);
    expect(graphql).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        owner: "evolvo-auto",
        repo: "habit-cli",
      }),
    );
    expect(graphql).toHaveBeenNthCalledWith(
      3,
      expect.any(String),
      expect.objectContaining({
        ownerId: "owner-id",
        repositoryId: "repo-id",
        title: "habit-cli Workflow",
      }),
    );
    expect(graphql).toHaveBeenNthCalledWith(
      5,
      expect.any(String),
      expect.objectContaining({
        projectId: "project-id",
        options: expect.arrayContaining([
          expect.objectContaining({
            name: "Inbox",
            color: "GRAY",
            description: "raw generated work, not yet processed",
          }),
          expect.objectContaining({
            name: "Blocked",
            color: "RED",
            description: "needs human input / external dependency / repeated failure",
          }),
        ]),
      }),
    );
  });

  it("falls back to a user owner when the repository owner is not an organization", async () => {
    const graphql = vi.fn()
      .mockResolvedValueOnce({
        organization: null,
      })
      .mockResolvedValueOnce({
        user: {
          id: "user-id",
          login: "paddy",
          __typename: "User",
          projectsV2: {
            nodes: [
              {
                id: "project-id",
                number: 4,
                repositories: {
                  nodes: [
                    { nameWithOwner: "paddy/habit-cli" },
                  ],
                },
                title: "habit-cli Workflow",
                url: "https://github.com/users/paddy/projects/4",
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          id: "repo-id",
        },
      })
      .mockResolvedValueOnce({
        organization: null,
      })
      .mockResolvedValueOnce({
        user: {
          projectV2: {
            fields: {
              nodes: [
                {
                  id: "stage-field-id",
                  name: "Stage",
                  options: [
                    { id: "opt-inbox", name: "Inbox" },
                    { id: "opt-review", name: "Ready for Review" },
                  ],
                },
              ],
            },
          },
        },
      });

    const client = new GitHubProjectsV2Client({ graphql } as never);

    const result = await client.ensureProjectBoard(createProject("paddy"));

    expect(result.workflow).toEqual(
      expect.objectContaining({
        boardOwner: "paddy",
        boardNumber: 4,
        boardId: "project-id",
        boardUrl: "https://github.com/users/paddy/projects/4",
        stageFieldId: "stage-field-id",
        boardProvisioned: true,
        stageOptionIds: expect.objectContaining({
          Inbox: "opt-inbox",
          "Ready for Review": "opt-review",
        }),
      }),
    );
    expect(graphql).toHaveBeenCalledTimes(5);
  });
});
