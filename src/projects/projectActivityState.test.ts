import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireCodingLease,
  getProjectActivityStatePath,
  readProjectActivityState,
  recordProjectFailure,
  recordProjectStageTransition,
  releaseCodingLease,
  setProjectActivityMode,
  setProjectCurrentWorkItem,
  synchronizeProjectActivityState,
} from "./projectActivityState.js";
import type { ProjectRecord } from "./projectRegistry.js";
import { createDefaultProjectWorkflow } from "./projectWorkflow.js";

async function createTempWorkDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "project-activity-state-"));
}

function createProject(slug: string, kind: "default" | "managed"): ProjectRecord {
  return {
    slug,
    displayName: kind === "default" ? "Evolvo" : "Habit CLI",
    kind,
    issueLabel: `project:${slug}`,
    trackerRepo: {
      owner: "evolvo-auto",
      repo: "evolvo-ts",
      url: "https://github.com/evolvo-auto/evolvo-ts",
    },
    executionRepo: {
      owner: "evolvo-auto",
      repo: kind === "default" ? "evolvo-ts" : "habit-cli",
      url: kind === "default"
        ? "https://github.com/evolvo-auto/evolvo-ts"
        : "https://github.com/evolvo-auto/habit-cli",
      defaultBranch: "main",
    },
    cwd: kind === "default" ? "/tmp/evolvo-ts" : "/tmp/habit-cli",
    status: "active",
    sourceIssueNumber: kind === "default" ? null : 18,
    createdAt: "2026-03-08T09:00:00.000Z",
    updatedAt: "2026-03-08T09:00:00.000Z",
    provisioning: {
      labelCreated: true,
      repoCreated: true,
      workspacePrepared: true,
      lastError: null,
    },
    workflow: createDefaultProjectWorkflow("evolvo-auto"),
  };
}

describe("projectActivityState", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("returns an empty default state when the file is missing", async () => {
    const workDir = await createTempWorkDir();
    tempDirs.push(workDir);

    await expect(readProjectActivityState(workDir)).resolves.toEqual({
      version: 1,
      projects: [],
    });
  });

  it("synchronizes default and managed projects with active managed project slugs", async () => {
    const workDir = await createTempWorkDir();
    tempDirs.push(workDir);

    const state = await synchronizeProjectActivityState({
      workDir,
      projects: [createProject("evolvo", "default"), createProject("habit-cli", "managed")],
      activeManagedProjectSlugs: ["habit-cli"],
    });

    expect(state.projects).toEqual([
      expect.objectContaining({
        slug: "evolvo",
        activityState: "active",
      }),
      expect.objectContaining({
        slug: "habit-cli",
        activityState: "active",
      }),
    ]);
  });

  it("acquires and releases coding leases", async () => {
    const workDir = await createTempWorkDir();
    tempDirs.push(workDir);
    await synchronizeProjectActivityState({
      workDir,
      projects: [createProject("evolvo", "default"), createProject("habit-cli", "managed")],
      activeManagedProjectSlugs: ["habit-cli"],
    });

    await acquireCodingLease({
      workDir,
      slug: "habit-cli",
      issueNumber: 42,
      holder: "coding-agent",
      at: "2026-03-08T10:00:00.000Z",
    });
    let state = await readProjectActivityState(workDir);
    expect(state.projects.find((entry) => entry.slug === "habit-cli")).toEqual(
      expect.objectContaining({
        currentCodingLease: expect.objectContaining({
          issueNumber: 42,
          holder: "coding-agent",
        }),
        schedulingEligibility: expect.objectContaining({
          eligible: false,
          reason: "coding lease already active",
        }),
      }),
    );

    await releaseCodingLease({
      workDir,
      slug: "habit-cli",
      at: "2026-03-08T10:05:00.000Z",
    });
    state = await readProjectActivityState(workDir);
    expect(state.projects.find((entry) => entry.slug === "habit-cli")).toEqual(
      expect.objectContaining({
        currentCodingLease: null,
        schedulingEligibility: expect.objectContaining({
          eligible: true,
          reason: null,
        }),
      }),
    );
  });

  it("records current work item, stage transitions, failures, and explicit stop state", async () => {
    const workDir = await createTempWorkDir();
    tempDirs.push(workDir);
    await synchronizeProjectActivityState({
      workDir,
      projects: [createProject("evolvo", "default"), createProject("habit-cli", "managed")],
      activeManagedProjectSlugs: ["habit-cli"],
    });

    await setProjectCurrentWorkItem({
      workDir,
      slug: "habit-cli",
      workItem: {
        issueNumber: 7,
        issueUrl: "https://github.com/evolvo-auto/habit-cli/issues/7",
        stage: "In Dev",
        branchName: "feat/issue-7",
        pullRequestUrl: null,
      },
      at: "2026-03-08T11:00:00.000Z",
    });
    await recordProjectStageTransition({
      workDir,
      slug: "habit-cli",
      from: "Ready for Dev",
      to: "In Dev",
      reason: "coding agent started",
      at: "2026-03-08T11:00:00.000Z",
    });
    await recordProjectFailure({
      workDir,
      slug: "habit-cli",
      stage: "Review",
      message: "validation summary missing",
      at: "2026-03-08T11:15:00.000Z",
    });
    await setProjectActivityMode({
      workDir,
      slug: "habit-cli",
      activityState: "stopped",
      requestedBy: "discord:operator-1",
      updatedAt: "2026-03-08T11:30:00.000Z",
    });

    const state = await readProjectActivityState(workDir);
    expect(state.projects.find((entry) => entry.slug === "habit-cli")).toEqual(
      expect.objectContaining({
        activityState: "stopped",
        requestedBy: "discord:operator-1",
        currentWorkItem: expect.objectContaining({
          issueNumber: 7,
          stage: "In Dev",
        }),
        lastStageTransition: expect.objectContaining({
          from: "Ready for Dev",
          to: "In Dev",
        }),
        lastFailure: expect.objectContaining({
          stage: "Review",
          message: "validation summary missing",
        }),
      }),
    );
  });

  it("recovers malformed activity state files", async () => {
    const workDir = await createTempWorkDir();
    tempDirs.push(workDir);
    const statePath = getProjectActivityStatePath(workDir);
    await mkdir(join(workDir, ".evolvo"), { recursive: true });
    await writeFile(statePath, "{\"projects\":", "utf8");

    await expect(readProjectActivityState(workDir)).resolves.toEqual({
      version: 1,
      projects: [],
    });
    await expect(readFile(statePath, "utf8")).resolves.toContain("\"version\": 1");
  });
});
