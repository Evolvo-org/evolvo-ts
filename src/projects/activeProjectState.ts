import { join } from "node:path";
import {
  readRecoverableJsonState,
  writeAtomicJsonState,
  type RecoverableJsonStateNormalizationResult,
} from "../runtime/localStateFile.js";

const ACTIVE_PROJECT_STATE_FILE_NAME = "active-project.json";
const ACTIVE_PROJECT_STATE_VERSION = 2;

export type ActiveProjectSelectionState = "active" | "stopped";
export type ActiveProjectDeferredStopMode = "when-project-complete";
export type StopActiveProjectMode = "now" | ActiveProjectDeferredStopMode;

export type ActiveProjectStateSource =
  | "start-project-command"
  | "project-provisioning"
  | "stop-project-command";

export type ActiveProjectState = {
  version: typeof ACTIVE_PROJECT_STATE_VERSION;
  activeProjectSlug: string | null;
  selectionState: ActiveProjectSelectionState | null;
  deferredStopMode?: ActiveProjectDeferredStopMode | null;
  updatedAt: string | null;
  requestedBy: string | null;
  source: ActiveProjectStateSource | null;
};

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function requireNonEmptyInput(value: string, label: "slug" | "requestedBy"): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Active project state ${label} cannot be empty.`);
  }

  return normalized;
}

function normalizeSource(value: unknown): ActiveProjectStateSource | null {
  if (
    value === "start-project-command" ||
    value === "project-provisioning" ||
    value === "stop-project-command"
  ) {
    return value;
  }

  return null;
}

function normalizeSelectionState(value: unknown): ActiveProjectSelectionState | null {
  if (value === "active" || value === "stopped") {
    return value;
  }

  return null;
}

function normalizeDeferredStopMode(value: unknown): ActiveProjectDeferredStopMode | null {
  if (value === "when-project-complete") {
    return value;
  }

  return null;
}

function createDefaultActiveProjectState(): ActiveProjectState {
  return {
    version: ACTIVE_PROJECT_STATE_VERSION,
    activeProjectSlug: null,
    selectionState: null,
    deferredStopMode: null,
    updatedAt: null,
    requestedBy: null,
    source: null,
  };
}

function normalizeActiveProjectState(raw: unknown): RecoverableJsonStateNormalizationResult<ActiveProjectState> {
  if (typeof raw !== "object" || raw === null) {
    return {
      state: createDefaultActiveProjectState(),
      recoveredInvalid: true,
    };
  }

  const candidate = raw as Partial<ActiveProjectState>;
  const rawVersion = (raw as { version?: unknown }).version;
  const activeProjectSlug = normalizeNonEmptyString(candidate.activeProjectSlug);
  const selectionState = normalizeSelectionState(candidate.selectionState);
  const deferredStopMode = normalizeDeferredStopMode(candidate.deferredStopMode);
  const updatedAt = normalizeNonEmptyString(candidate.updatedAt);
  const requestedBy = normalizeNonEmptyString(candidate.requestedBy);
  const source = normalizeSource(candidate.source);
  const version = rawVersion === 1 || rawVersion === ACTIVE_PROJECT_STATE_VERSION
    ? ACTIVE_PROJECT_STATE_VERSION
    : null;
  const normalizedSelectionState = selectionState ?? (activeProjectSlug ? "active" : null);

  if (
    version === null ||
    ("activeProjectSlug" in candidate && candidate.activeProjectSlug !== null && activeProjectSlug === null) ||
    ("selectionState" in candidate && candidate.selectionState !== null && selectionState === null) ||
    ("deferredStopMode" in candidate && candidate.deferredStopMode !== null && deferredStopMode === null) ||
    (activeProjectSlug === null && normalizedSelectionState !== null) ||
    (activeProjectSlug === null && deferredStopMode !== null) ||
    (normalizedSelectionState !== "active" && deferredStopMode !== null) ||
    ("updatedAt" in candidate && candidate.updatedAt !== null && updatedAt === null) ||
    ("requestedBy" in candidate && candidate.requestedBy !== null && requestedBy === null) ||
    ("source" in candidate && candidate.source !== null && source === null)
  ) {
    return {
      state: createDefaultActiveProjectState(),
      recoveredInvalid: true,
    };
  }

  return {
    state: {
      version: ACTIVE_PROJECT_STATE_VERSION,
      activeProjectSlug,
      selectionState: normalizedSelectionState,
      deferredStopMode,
      updatedAt,
      requestedBy,
      source,
    },
    recoveredInvalid: false,
  };
}

export function getActiveProjectStatePath(workDir: string): string {
  return join(workDir, ".evolvo", ACTIVE_PROJECT_STATE_FILE_NAME);
}

export async function readActiveProjectState(workDir: string): Promise<ActiveProjectState> {
  return readRecoverableJsonState({
    statePath: getActiveProjectStatePath(workDir),
    createDefaultState: createDefaultActiveProjectState,
    normalizeState: normalizeActiveProjectState,
    warningLabel: "active project state",
  });
}

async function writeActiveProjectState(
  workDir: string,
  state: ActiveProjectState,
): Promise<ActiveProjectState> {
  await writeAtomicJsonState(getActiveProjectStatePath(workDir), state);
  return state;
}

export async function setActiveProjectState(options: {
  workDir: string;
  slug: string;
  requestedBy: string;
  source: ActiveProjectStateSource;
  updatedAt?: string;
}): Promise<ActiveProjectState> {
  const activeProjectSlug = requireNonEmptyInput(options.slug, "slug");
  const requestedBy = requireNonEmptyInput(options.requestedBy, "requestedBy");

  return writeActiveProjectState(options.workDir, {
    version: ACTIVE_PROJECT_STATE_VERSION,
    activeProjectSlug,
    selectionState: "active",
    deferredStopMode: null,
    updatedAt: options.updatedAt?.trim() || new Date().toISOString(),
    requestedBy,
    source: options.source,
  });
}

export async function stopActiveProjectState(options: {
  workDir: string;
  requestedBy: string;
  mode?: StopActiveProjectMode;
  updatedAt?: string;
}): Promise<{
  status:
    | "stopped"
    | "stop-when-complete-scheduled"
    | "already-stop-when-complete-scheduled"
    | "already-stopped"
    | "no-active-project";
  state: ActiveProjectState;
}> {
  const currentState = await readActiveProjectState(options.workDir);
  if (currentState.activeProjectSlug === null) {
    return {
      status: "no-active-project",
      state: currentState,
    };
  }

  const mode = options.mode ?? "now";
  if (currentState.selectionState === "stopped") {
    return {
      status: "already-stopped",
      state: currentState,
    };
  }

  const requestedBy = requireNonEmptyInput(options.requestedBy, "requestedBy");
  if (mode === "when-project-complete") {
    if (currentState.deferredStopMode === "when-project-complete") {
      return {
        status: "already-stop-when-complete-scheduled",
        state: currentState,
      };
    }

    const nextState: ActiveProjectState = {
      version: ACTIVE_PROJECT_STATE_VERSION,
      activeProjectSlug: currentState.activeProjectSlug,
      selectionState: "active",
      deferredStopMode: "when-project-complete",
      updatedAt: options.updatedAt?.trim() || new Date().toISOString(),
      requestedBy,
      source: "stop-project-command",
    };
    await writeActiveProjectState(options.workDir, nextState);
    return {
      status: "stop-when-complete-scheduled",
      state: nextState,
    };
  }

  const nextState: ActiveProjectState = {
    version: ACTIVE_PROJECT_STATE_VERSION,
    activeProjectSlug: currentState.activeProjectSlug,
    selectionState: "stopped",
    deferredStopMode: null,
    updatedAt: options.updatedAt?.trim() || new Date().toISOString(),
    requestedBy,
    source: "stop-project-command",
  };
  await writeActiveProjectState(options.workDir, nextState);
  return {
    status: "stopped",
    state: nextState,
  };
}

export async function clearActiveProjectState(workDir: string): Promise<ActiveProjectState> {
  const nextState = createDefaultActiveProjectState();
  await writeActiveProjectState(workDir, nextState);
  return nextState;
}
