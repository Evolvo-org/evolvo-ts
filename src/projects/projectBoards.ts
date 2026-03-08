import { upsertProjectRecord, readProjectRegistry, type DefaultProjectContext, type ProjectRecord, type ProjectRegistry } from "./projectRegistry.js";
import type { GitHubProjectsV2Client } from "../github/githubProjectsV2.js";

export type EnsureProjectBoardResult =
  | {
      ok: true;
      project: ProjectRecord;
    }
  | {
      ok: false;
      project: ProjectRecord;
      message: string;
    };

export async function ensureProjectBoardRegistration(options: {
  workDir: string;
  defaultProject: DefaultProjectContext;
  project: ProjectRecord;
  boardsClient: Pick<GitHubProjectsV2Client, "ensureProjectBoard">;
}): Promise<EnsureProjectBoardResult> {
  try {
    const result = await options.boardsClient.ensureProjectBoard(options.project);
    const nextProject: ProjectRecord = {
      ...options.project,
      workflow: result.workflow,
      updatedAt: new Date().toISOString(),
    };
    await upsertProjectRecord(options.workDir, options.defaultProject, nextProject);
    return {
      ok: true,
      project: nextProject,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitHub Projects provisioning error.";
    const nextProject: ProjectRecord = {
      ...options.project,
      workflow: {
        ...options.project.workflow,
        boardProvisioned: false,
        lastError: message,
        lastSyncedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    await upsertProjectRecord(options.workDir, options.defaultProject, nextProject);
    return {
      ok: false,
      project: nextProject,
      message,
    };
  }
}

export async function ensureProjectBoardsForRegistry(options: {
  workDir: string;
  defaultProject: DefaultProjectContext;
  boardsClient: Pick<GitHubProjectsV2Client, "ensureProjectBoard">;
}): Promise<{
  registry: ProjectRegistry;
  results: EnsureProjectBoardResult[];
}> {
  const registry = await readProjectRegistry(options.workDir, options.defaultProject);
  const results: EnsureProjectBoardResult[] = [];

  for (const project of registry.projects) {
    results.push(await ensureProjectBoardRegistration({
      workDir: options.workDir,
      defaultProject: options.defaultProject,
      project,
      boardsClient: options.boardsClient,
    }));
  }

  return {
    registry: await readProjectRegistry(options.workDir, options.defaultProject),
    results,
  };
}
