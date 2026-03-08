import type { DefaultProjectContext, ProjectRecord } from "../projects/projectRegistry.js";
import { findProjectBySlug, readProjectRegistry } from "../projects/projectRegistry.js";
import type { ActiveProjectState } from "../projects/activeProjectState.js";
import type {
  IssueSummary,
  TaskIssueManager,
  UnauthorizedIssueClosureResult,
} from "./taskIssueManager.js";

export type UnifiedIssue = IssueSummary & {
  queueKey: string;
  sourceKind: "tracker" | "project-repo";
  projectSlug: string | null;
  repository: {
    owner: string;
    repo: string;
    url: string;
    reference: string;
  };
  project: ProjectRecord | null;
};

export type UnifiedIssueQueue = {
  issues: UnifiedIssue[];
  unauthorizedClosures: UnauthorizedIssueClosureResult[];
  activeManagedProject: ProjectRecord | null;
};

function buildRepositoryReference(repository: { owner: string; repo: string }): string {
  return `${repository.owner}/${repository.repo}`;
}

function buildTrackerUnifiedIssue(
  issue: IssueSummary,
  defaultProject: DefaultProjectContext,
): UnifiedIssue {
  return {
    ...issue,
    queueKey: `tracker:${defaultProject.owner}/${defaultProject.repo}#${issue.number}`,
    sourceKind: "tracker",
    projectSlug: null,
    repository: {
      owner: defaultProject.owner,
      repo: defaultProject.repo,
      url: `https://github.com/${defaultProject.owner}/${defaultProject.repo}`,
      reference: buildRepositoryReference(defaultProject),
    },
    project: null,
  };
}

function buildProjectUnifiedIssue(issue: IssueSummary, project: ProjectRecord): UnifiedIssue {
  return {
    ...issue,
    queueKey: `project:${project.slug}#${issue.number}`,
    sourceKind: "project-repo",
    projectSlug: project.slug,
    repository: {
      owner: project.executionRepo.owner,
      repo: project.executionRepo.repo,
      url: project.executionRepo.url,
      reference: buildRepositoryReference(project.executionRepo),
    },
    project,
  };
}

async function resolveActiveManagedProject(
  workDir: string,
  defaultProject: DefaultProjectContext,
  activeProjectState: ActiveProjectState,
): Promise<ProjectRecord | null> {
  if (
    activeProjectState.selectionState !== "active" ||
    activeProjectState.activeProjectSlug === null
  ) {
    return null;
  }

  const registry = await readProjectRegistry(workDir, defaultProject);
  const project = findProjectBySlug(registry, activeProjectState.activeProjectSlug);
  if (!project || project.kind !== "managed" || project.status !== "active") {
    return null;
  }

  return project;
}

export async function buildUnifiedIssueQueue(options: {
  trackerIssueManager: TaskIssueManager;
  workDir: string;
  defaultProject: DefaultProjectContext;
  activeProjectState: ActiveProjectState;
}): Promise<UnifiedIssueQueue> {
  const trackerInventory = await options.trackerIssueManager.listAuthorizedOpenIssues();
  const activeManagedProject = await resolveActiveManagedProject(
    options.workDir,
    options.defaultProject,
    options.activeProjectState,
  );

  const issues: UnifiedIssue[] = trackerInventory.issues.map((issue) => buildTrackerUnifiedIssue(issue, options.defaultProject));

  if (activeManagedProject !== null) {
    const projectIssueManager = options.trackerIssueManager.forRepository({
      owner: activeManagedProject.executionRepo.owner,
      repo: activeManagedProject.executionRepo.repo,
    });
    const projectIssues = await projectIssueManager.listOpenIssues();
    issues.unshift(...projectIssues.map((issue) => buildProjectUnifiedIssue(issue, activeManagedProject)));
  }

  return {
    issues,
    unauthorizedClosures: trackerInventory.unauthorizedClosures,
    activeManagedProject,
  };
}
