import { join } from "node:path";
import {
  readRecoverableJsonState,
  writeAtomicJsonState,
  type RecoverableJsonStateNormalizationResult,
} from "../runtime/localStateFile.js";
import type { ProjectRecord } from "./projectRegistry.js";
import type { ProjectWorkflowStage } from "./projectWorkflow.js";
import { DEFAULT_PROJECT_SLUG } from "./projectNaming.js";

const PROJECT_ACTIVITY_STATE_FILE_NAME = "project-activity.json";
const PROJECT_ACTIVITY_STATE_VERSION = 1;

export type ProjectActivityMode = "active" | "stopped";
export type ProjectDeferredStopMode = "when-project-complete";

export type CodingLease = {
  leaseId: string;
  holder: string;
  acquiredAt: string;
  heartbeatAt: string;
  issueNumber: number;
  branchName: string | null;
  pullRequestUrl: string | null;
};

export type ProjectCurrentWorkItem = {
  issueNumber: number;
  issueUrl: string;
  stage: ProjectWorkflowStage;
  branchName: string | null;
  pullRequestUrl: string | null;
};

export type ProjectStageTransition = {
  from: ProjectWorkflowStage | null;
  to: ProjectWorkflowStage;
  at: string;
  reason: string | null;
};

export type ProjectFailureRecord = {
  stage: string;
  message: string;
  at: string;
};

export type ProjectSchedulingEligibility = {
  eligible: boolean;
  reason: string | null;
  lastScheduledAt: string | null;
};

export type ProjectActivityStateEntry = {
  slug: string;
  activityState: ProjectActivityMode;
  deferredStopMode: ProjectDeferredStopMode | null;
  requestedBy: string | null;
  updatedAt: string | null;
  currentCodingLease: CodingLease | null;
  currentWorkItem: ProjectCurrentWorkItem | null;
  lastStageTransition: ProjectStageTransition | null;
  schedulingEligibility: ProjectSchedulingEligibility;
  lastFailure: ProjectFailureRecord | null;
};

export type ProjectActivityState = {
  version: typeof PROJECT_ACTIVITY_STATE_VERSION;
  projects: ProjectActivityStateEntry[];
};

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNullableString(value: unknown): string | null {
  return normalizeNonEmptyString(value);
}

function normalizeProjectWorkflowStage(value: unknown): ProjectWorkflowStage | null {
  if (
    value === "Inbox"
    || value === "Planning"
    || value === "Ready for Dev"
    || value === "In Dev"
    || value === "Ready for Review"
    || value === "In Review"
    || value === "Ready for Release"
    || value === "Releasing"
    || value === "Blocked"
    || value === "Done"
  ) {
    return value;
  }

  return null;
}

function normalizeCodingLease(value: unknown): CodingLease | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Partial<CodingLease>;
  const leaseId = normalizeNonEmptyString(candidate.leaseId);
  const holder = normalizeNonEmptyString(candidate.holder);
  const acquiredAt = normalizeNonEmptyString(candidate.acquiredAt);
  const heartbeatAt = normalizeNonEmptyString(candidate.heartbeatAt);
  const issueNumber = typeof candidate.issueNumber === "number" && Number.isInteger(candidate.issueNumber)
    ? candidate.issueNumber
    : null;

  if (!leaseId || !holder || !acquiredAt || !heartbeatAt || issueNumber === null) {
    return null;
  }

  return {
    leaseId,
    holder,
    acquiredAt,
    heartbeatAt,
    issueNumber,
    branchName: normalizeNullableString(candidate.branchName),
    pullRequestUrl: normalizeNullableString(candidate.pullRequestUrl),
  };
}

function normalizeCurrentWorkItem(value: unknown): ProjectCurrentWorkItem | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Partial<ProjectCurrentWorkItem>;
  const issueNumber = typeof candidate.issueNumber === "number" && Number.isInteger(candidate.issueNumber)
    ? candidate.issueNumber
    : null;
  const issueUrl = normalizeNonEmptyString(candidate.issueUrl);
  const stage = normalizeProjectWorkflowStage(candidate.stage);
  if (issueNumber === null || !issueUrl || !stage) {
    return null;
  }

  return {
    issueNumber,
    issueUrl,
    stage,
    branchName: normalizeNullableString(candidate.branchName),
    pullRequestUrl: normalizeNullableString(candidate.pullRequestUrl),
  };
}

function normalizeStageTransition(value: unknown): ProjectStageTransition | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Partial<ProjectStageTransition>;
  const to = normalizeProjectWorkflowStage(candidate.to);
  const from = candidate.from === null ? null : normalizeProjectWorkflowStage(candidate.from);
  const at = normalizeNonEmptyString(candidate.at);
  if (!to || !at) {
    return null;
  }

  return {
    from,
    to,
    at,
    reason: normalizeNullableString(candidate.reason),
  };
}

function normalizeFailureRecord(value: unknown): ProjectFailureRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Partial<ProjectFailureRecord>;
  const stage = normalizeNonEmptyString(candidate.stage);
  const message = normalizeNonEmptyString(candidate.message);
  const at = normalizeNonEmptyString(candidate.at);
  if (!stage || !message || !at) {
    return null;
  }

  return { stage, message, at };
}

function normalizeSchedulingEligibility(value: unknown): ProjectSchedulingEligibility {
  if (typeof value !== "object" || value === null) {
    return {
      eligible: true,
      reason: null,
      lastScheduledAt: null,
    };
  }

  const candidate = value as Partial<ProjectSchedulingEligibility>;
  return {
    eligible: candidate.eligible !== false,
    reason: normalizeNullableString(candidate.reason),
    lastScheduledAt: normalizeNullableString(candidate.lastScheduledAt),
  };
}

function createDefaultProjectActivityEntry(slug: string, activityState: ProjectActivityMode): ProjectActivityStateEntry {
  return {
    slug,
    activityState,
    deferredStopMode: null,
    requestedBy: null,
    updatedAt: null,
    currentCodingLease: null,
    currentWorkItem: null,
    lastStageTransition: null,
    schedulingEligibility: {
      eligible: true,
      reason: null,
      lastScheduledAt: null,
    },
    lastFailure: null,
  };
}

function createDefaultProjectActivityState(): ProjectActivityState {
  return {
    version: PROJECT_ACTIVITY_STATE_VERSION,
    projects: [],
  };
}

function normalizeProjectActivityEntry(value: unknown): ProjectActivityStateEntry | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Partial<ProjectActivityStateEntry>;
  const slug = normalizeNonEmptyString(candidate.slug);
  const activityState = candidate.activityState === "active" || candidate.activityState === "stopped"
    ? candidate.activityState
    : null;
  if (!slug || !activityState) {
    return null;
  }

  const deferredStopMode = candidate.deferredStopMode === "when-project-complete"
    ? "when-project-complete"
    : null;

  return {
    slug,
    activityState,
    deferredStopMode,
    requestedBy: normalizeNullableString(candidate.requestedBy),
    updatedAt: normalizeNullableString(candidate.updatedAt),
    currentCodingLease: normalizeCodingLease(candidate.currentCodingLease),
    currentWorkItem: normalizeCurrentWorkItem(candidate.currentWorkItem),
    lastStageTransition: normalizeStageTransition(candidate.lastStageTransition),
    schedulingEligibility: normalizeSchedulingEligibility(candidate.schedulingEligibility),
    lastFailure: normalizeFailureRecord(candidate.lastFailure),
  };
}

function normalizeProjectActivityState(raw: unknown): RecoverableJsonStateNormalizationResult<ProjectActivityState> {
  if (typeof raw !== "object" || raw === null) {
    return {
      state: createDefaultProjectActivityState(),
      recoveredInvalid: true,
    };
  }

  const candidate = raw as Partial<ProjectActivityState>;
  if ((raw as { version?: unknown }).version !== PROJECT_ACTIVITY_STATE_VERSION || !Array.isArray(candidate.projects)) {
    return {
      state: createDefaultProjectActivityState(),
      recoveredInvalid: true,
    };
  }

  let recoveredInvalid = false;
  const entries = new Map<string, ProjectActivityStateEntry>();
  for (const rawEntry of candidate.projects) {
    const entry = normalizeProjectActivityEntry(rawEntry);
    if (!entry) {
      recoveredInvalid = true;
      continue;
    }

    entries.set(entry.slug, entry);
  }

  return {
    state: {
      version: PROJECT_ACTIVITY_STATE_VERSION,
      projects: [...entries.values()].sort((left, right) => left.slug.localeCompare(right.slug)),
    },
    recoveredInvalid,
  };
}

function replaceProjectActivityEntry(
  state: ProjectActivityState,
  nextEntry: ProjectActivityStateEntry,
): ProjectActivityState {
  return {
    version: PROJECT_ACTIVITY_STATE_VERSION,
    projects: [
      ...state.projects.filter((entry) => entry.slug !== nextEntry.slug),
      nextEntry,
    ].sort((left, right) => left.slug.localeCompare(right.slug)),
  };
}

export function getProjectActivityStatePath(workDir: string): string {
  return join(workDir, ".evolvo", PROJECT_ACTIVITY_STATE_FILE_NAME);
}

export async function readProjectActivityState(workDir: string): Promise<ProjectActivityState> {
  return readRecoverableJsonState({
    statePath: getProjectActivityStatePath(workDir),
    createDefaultState: createDefaultProjectActivityState,
    normalizeState: normalizeProjectActivityState,
    warningLabel: "project activity state",
  });
}

async function writeProjectActivityState(workDir: string, state: ProjectActivityState): Promise<ProjectActivityState> {
  await writeAtomicJsonState(getProjectActivityStatePath(workDir), state);
  return state;
}

export async function synchronizeProjectActivityState(options: {
  workDir: string;
  projects: ProjectRecord[];
  activeManagedProjectSlugs: string[];
}): Promise<ProjectActivityState> {
  const currentState = await readProjectActivityState(options.workDir);
  const currentBySlug = new Map(currentState.projects.map((entry) => [entry.slug, entry] as const));
  const activeManagedProjectSlugSet = new Set(options.activeManagedProjectSlugs.map((slug) => slug.trim()).filter(Boolean));

  const nextProjects = options.projects.map((project) => {
    const existing = currentBySlug.get(project.slug);
    const activityState: ProjectActivityMode = project.slug === DEFAULT_PROJECT_SLUG
      ? "active"
      : activeManagedProjectSlugSet.has(project.slug)
        ? "active"
        : "stopped";

    return {
      ...createDefaultProjectActivityEntry(project.slug, activityState),
      ...existing,
      slug: project.slug,
      activityState,
      deferredStopMode: activityState === "active" ? existing?.deferredStopMode ?? null : null,
      currentCodingLease: activityState === "active" ? existing?.currentCodingLease ?? null : null,
      schedulingEligibility: {
        eligible: activityState === "active",
        reason: activityState === "active" ? existing?.schedulingEligibility.reason ?? null : "project is stopped",
        lastScheduledAt: existing?.schedulingEligibility.lastScheduledAt ?? null,
      },
    };
  });

  return writeProjectActivityState(options.workDir, {
    version: PROJECT_ACTIVITY_STATE_VERSION,
    projects: nextProjects.sort((left, right) => left.slug.localeCompare(right.slug)),
  });
}

export async function setProjectActivityMode(options: {
  workDir: string;
  slug: string;
  activityState: ProjectActivityMode;
  requestedBy: string | null;
  updatedAt?: string;
  deferredStopMode?: ProjectDeferredStopMode | null;
}): Promise<ProjectActivityState> {
  const currentState = await readProjectActivityState(options.workDir);
  const existing = currentState.projects.find((entry) => entry.slug === options.slug)
    ?? createDefaultProjectActivityEntry(options.slug, options.activityState);

  return writeProjectActivityState(options.workDir, replaceProjectActivityEntry(currentState, {
    ...existing,
    activityState: options.activityState,
    deferredStopMode: options.activityState === "active"
      ? options.deferredStopMode ?? existing.deferredStopMode ?? null
      : null,
    requestedBy: options.requestedBy,
    updatedAt: options.updatedAt?.trim() || new Date().toISOString(),
    currentCodingLease: options.activityState === "active" ? existing.currentCodingLease : null,
    schedulingEligibility: {
      eligible: options.activityState === "active",
      reason: options.activityState === "active" ? null : "project is stopped",
      lastScheduledAt: existing.schedulingEligibility.lastScheduledAt,
    },
  }));
}

export async function acquireCodingLease(options: {
  workDir: string;
  slug: string;
  issueNumber: number;
  holder: string;
  branchName?: string | null;
  pullRequestUrl?: string | null;
  at?: string;
}): Promise<ProjectActivityState> {
  const currentState = await readProjectActivityState(options.workDir);
  const existing = currentState.projects.find((entry) => entry.slug === options.slug)
    ?? createDefaultProjectActivityEntry(options.slug, "active");
  const at = options.at?.trim() || new Date().toISOString();

  return writeProjectActivityState(options.workDir, replaceProjectActivityEntry(currentState, {
    ...existing,
    currentCodingLease: {
      leaseId: `${options.slug}:${options.issueNumber}:${at}`,
      holder: options.holder,
      acquiredAt: at,
      heartbeatAt: at,
      issueNumber: options.issueNumber,
      branchName: options.branchName?.trim() || null,
      pullRequestUrl: options.pullRequestUrl?.trim() || null,
    },
    updatedAt: at,
    schedulingEligibility: {
      eligible: false,
      reason: "coding lease already active",
      lastScheduledAt: at,
    },
  }));
}

export async function releaseCodingLease(options: {
  workDir: string;
  slug: string;
  at?: string;
}): Promise<ProjectActivityState> {
  const currentState = await readProjectActivityState(options.workDir);
  const existing = currentState.projects.find((entry) => entry.slug === options.slug)
    ?? createDefaultProjectActivityEntry(options.slug, "active");
  const at = options.at?.trim() || new Date().toISOString();

  return writeProjectActivityState(options.workDir, replaceProjectActivityEntry(currentState, {
    ...existing,
    currentCodingLease: null,
    updatedAt: at,
    schedulingEligibility: {
      eligible: existing.activityState === "active",
      reason: existing.activityState === "active" ? null : "project is stopped",
      lastScheduledAt: existing.schedulingEligibility.lastScheduledAt,
    },
  }));
}

export async function setProjectCurrentWorkItem(options: {
  workDir: string;
  slug: string;
  workItem: ProjectCurrentWorkItem | null;
  at?: string;
}): Promise<ProjectActivityState> {
  const currentState = await readProjectActivityState(options.workDir);
  const existing = currentState.projects.find((entry) => entry.slug === options.slug)
    ?? createDefaultProjectActivityEntry(options.slug, "active");

  return writeProjectActivityState(options.workDir, replaceProjectActivityEntry(currentState, {
    ...existing,
    currentWorkItem: options.workItem,
    updatedAt: options.at?.trim() || new Date().toISOString(),
  }));
}

export async function recordProjectStageTransition(options: {
  workDir: string;
  slug: string;
  from: ProjectWorkflowStage | null;
  to: ProjectWorkflowStage;
  reason?: string | null;
  at?: string;
}): Promise<ProjectActivityState> {
  const currentState = await readProjectActivityState(options.workDir);
  const existing = currentState.projects.find((entry) => entry.slug === options.slug)
    ?? createDefaultProjectActivityEntry(options.slug, "active");
  const at = options.at?.trim() || new Date().toISOString();

  return writeProjectActivityState(options.workDir, replaceProjectActivityEntry(currentState, {
    ...existing,
    lastStageTransition: {
      from: options.from,
      to: options.to,
      at,
      reason: options.reason?.trim() || null,
    },
    updatedAt: at,
  }));
}

export async function recordProjectFailure(options: {
  workDir: string;
  slug: string;
  stage: string;
  message: string;
  at?: string;
}): Promise<ProjectActivityState> {
  const currentState = await readProjectActivityState(options.workDir);
  const existing = currentState.projects.find((entry) => entry.slug === options.slug)
    ?? createDefaultProjectActivityEntry(options.slug, "active");
  const at = options.at?.trim() || new Date().toISOString();

  return writeProjectActivityState(options.workDir, replaceProjectActivityEntry(currentState, {
    ...existing,
    lastFailure: {
      stage: options.stage.trim(),
      message: options.message.trim(),
      at,
    },
    updatedAt: at,
  }));
}
