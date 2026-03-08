import { describe, expect, it, vi } from "vitest";
import { ensureProjectBoardRegistration, ensureProjectBoardsForRegistry } from "./projectBoards.js";
import type { ProjectRecord } from "./projectRegistry.js";
import { createDefaultProjectWorkflow } from "./projectWorkflow.js";

const { upsertProjectRecordMock, readProjectRegistryMock } = vi.hoisted(() => ({
  upsertProjectRecordMock: vi.fn(),
  readProjectRegistryMock: vi.fn(),
}));

vi.mock("./projectRegistry.js", async () => {
  const actual = await vi.importActual<typeof import("./projectRegistry.js")>("./projectRegistry.js");
  return {
    ...actual,
    readProjectRegistry: readProjectRegistryMock,
    upsertProjectRecord: upsertProjectRecordMock,
  };
});

function createProject(slug: string): ProjectRecord {
  return {
    slug,
    displayName: slug === "evolvo" ? "Evolvo" : "Habit CLI",
    kind: slug === "evolvo" ? "default" : "managed",
    issueLabel: `project:${slug}`,
    trackerRepo: {
      owner: "evolvo-auto",
      repo: "evolvo-ts",
      url: "https://github.com/evolvo-auto/evolvo-ts",
    },
    executionRepo: {
      owner: "evolvo-auto",
      repo: slug === "evolvo" ? "evolvo-ts" : "habit-cli",
      url: slug === "evolvo"
        ? "https://github.com/evolvo-auto/evolvo-ts"
        : "https://github.com/evolvo-auto/habit-cli",
      defaultBranch: "main",
    },
    cwd: `/tmp/${slug}`,
    status: "active",
    sourceIssueNumber: slug === "evolvo" ? null : 33,
    createdAt: "2026-03-08T12:00:00.000Z",
    updatedAt: "2026-03-08T12:00:00.000Z",
    provisioning: {
      labelCreated: true,
      repoCreated: true,
      workspacePrepared: true,
      lastError: null,
    },
    workflow: createDefaultProjectWorkflow("evolvo-auto"),
  };
}

describe("projectBoards", () => {
  it("persists ensured project board metadata", async () => {
    const project = createProject("habit-cli");
    const boardsClient = {
      ensureProjectBoard: vi.fn().mockResolvedValue({
        workflow: {
          ...project.workflow,
          boardProvisioned: true,
          boardOwner: "evolvo-auto",
          boardId: "project-id",
          boardNumber: 7,
          boardUrl: "https://github.com/orgs/evolvo-auto/projects/7",
          stageFieldId: "stage-field-id",
          stageOptionIds: { Inbox: "opt-inbox" },
          lastError: null,
          lastSyncedAt: "2026-03-08T12:05:00.000Z",
        },
      }),
    };
    upsertProjectRecordMock.mockResolvedValue({ projects: [project] });

    const result = await ensureProjectBoardRegistration({
      workDir: "/tmp/evolvo-ts",
      defaultProject: {
        owner: "evolvo-auto",
        repo: "evolvo-ts",
        workDir: "/tmp/evolvo-ts",
      },
      project,
      boardsClient,
    });

    expect(result.ok).toBe(true);
    expect(upsertProjectRecordMock).toHaveBeenCalledWith(
      "/tmp/evolvo-ts",
      expect.any(Object),
      expect.objectContaining({
        slug: "habit-cli",
        workflow: expect.objectContaining({
          boardProvisioned: true,
          boardId: "project-id",
        }),
      }),
    );
  });

  it("ensures boards for every registered project", async () => {
    const defaultProject = createProject("evolvo");
    const managedProject = createProject("habit-cli");
    const boardsClient = {
      ensureProjectBoard: vi.fn().mockResolvedValue({
        workflow: {
          ...createDefaultProjectWorkflow("evolvo-auto"),
          boardProvisioned: true,
        },
      }),
    };
    readProjectRegistryMock
      .mockResolvedValueOnce({ version: 1, projects: [defaultProject, managedProject] })
      .mockResolvedValueOnce({ version: 1, projects: [defaultProject, managedProject] });
    upsertProjectRecordMock.mockResolvedValue({ projects: [defaultProject, managedProject] });

    const result = await ensureProjectBoardsForRegistry({
      workDir: "/tmp/evolvo-ts",
      defaultProject: {
        owner: "evolvo-auto",
        repo: "evolvo-ts",
        workDir: "/tmp/evolvo-ts",
      },
      boardsClient,
    });

    expect(result.results).toHaveLength(2);
    expect(boardsClient.ensureProjectBoard).toHaveBeenCalledTimes(2);
  });
});
