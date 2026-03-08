import { join } from "node:path";
import {
  PLANNED_ISSUE_RECENT_CLOSED_LOOKBACK_LIMIT,
  normalizePlannedIssueComparisonTitle,
  type IssueSummary,
  type PlannedIssueDraft,
  type TaskIssueManager,
} from "../issues/taskIssueManager.js";
import { GITHUB_OWNER, GITHUB_REPO, OPENAI_API_KEY } from "../environment.js";
import { GitHubClient } from "../github/githubClient.js";
import { getGitHubConfig } from "../github/githubConfig.js";
import {
  ProjectRepositoryIssueInspector,
  type ProjectRepositoryIssueState,
} from "../projects/projectRepositoryIssues.js";
import {
  buildDefaultProjectContext,
  readProjectRegistry,
} from "../projects/projectRegistry.js";
import { writeAtomicJsonState } from "../runtime/localStateFile.js";
import { runPlannerOpenAi } from "./plannerOpenAi.js";

export type PlannerAgentInput = {
  cycle: number;
  openIssueCount: number;
  minimumIssueCount: number;
  maximumOpenIssues: number;
  issueManager: TaskIssueManager;
  workDir: string;
};

export type PlannerAgentResult = {
  created: IssueSummary[];
  startupBootstrap: boolean;
};

type PlannerResponse = {
  issues: unknown[];
};

type PlannerFailureArtifact = {
  schemaVersion: 1;
  failedAtMs: number;
  failedAtIso: string;
  cycle: number;
  openIssueCount: number;
  minimumIssueCount: number;
  maximumOpenIssues: number;
  startupBootstrap: boolean;
  plannerPrompt: string | null;
  finalResponse: string | null;
  error: {
    name: string;
    message: string;
    stack: string | null;
  };
};

const PLANNER_FAILURE_ARTIFACT_RELATIVE_PATH = ".evolvo/planner-replenishment-failure.json";
const PLANNER_FAILURE_ARTIFACT_SCHEMA_VERSION = 1;

type PlannerManagedProjectState = {
  displayName: string;
  slug: string;
  workspacePath: string;
  repositoryState: ProjectRepositoryIssueState;
};

function dedupeClosedIssueHistory(issues: IssueSummary[]): IssueSummary[] {
  const seen = new Set<string>();
  const unique: IssueSummary[] = [];

  for (const issue of issues) {
    const key = normalizePlannedIssueComparisonTitle(issue.title);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(issue);
  }

  return unique;
}

function validatePlannedIssueDraft(issue: unknown, index: number): PlannedIssueDraft | null {
  if (!issue || typeof issue !== "object") {
    console.warn(`Planner returned invalid issue draft at index ${index}: expected an object.`);
    return null;
  }

  const draft = issue as { title?: unknown; description?: unknown };
  if (typeof draft.title !== "string" || typeof draft.description !== "string") {
    console.warn(`Planner returned invalid issue draft at index ${index}: title and description must be strings.`);
    return null;
  }

  const title = draft.title.trim();
  const description = draft.description.trim();
  if (!title || !description) {
    console.warn(`Planner returned invalid issue draft at index ${index}: title and description cannot be empty.`);
    return null;
  }

  return { title, description };
}

function dedupePlannedIssues(issues: PlannedIssueDraft[]): PlannedIssueDraft[] {
  const seen = new Set<string>();
  const unique: PlannedIssueDraft[] = [];

  for (const issue of issues) {
    const key = normalizePlannedIssueComparisonTitle(issue.title);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(issue);
  }

  return unique;
}

function parsePlannerResponse(finalResponse: string): PlannedIssueDraft[] {
  const parsed = JSON.parse(finalResponse) as PlannerResponse;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.issues)) {
    throw new Error("Planner response did not contain an issues array.");
  }

  const validIssues = parsed.issues
    .map((issue, index) => validatePlannedIssueDraft(issue, index))
    .filter((issue): issue is PlannedIssueDraft => issue !== null);
  return dedupePlannedIssues(validIssues);
}

function formatIssueListForPrompt(issues: IssueSummary[]): string {
  if (issues.length === 0) {
    return "- none";
  }

  return issues
    .map((issue) => `- #${issue.number} ${issue.title}`)
    .join("\n");
}

function buildManagedProjectPromptSection(states: PlannerManagedProjectState[]): string {
  if (states.length === 0) {
    return [
      "Registered managed project issue state:",
      "- none",
    ].join("\n");
  }

  return [
    "Registered managed project issue state:",
    ...states.flatMap((state) => [
      `### ${state.displayName} (\`${state.slug}\`)`,
      `- Execution repository: ${state.repositoryState.repository.reference}`,
      `- Workspace: \`${state.workspacePath}\``,
      "- Open project repository issues:",
      formatIssueListForPrompt(state.repositoryState.openIssues),
      "- Recent closed project repository issues:",
      formatIssueListForPrompt(state.repositoryState.recentClosedIssues),
    ]),
  ].join("\n");
}

async function inspectManagedProjectIssueState(workDir: string): Promise<PlannerManagedProjectState[]> {
  try {
    const registry = await readProjectRegistry(
      workDir,
      buildDefaultProjectContext({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        workDir,
      }),
    );
    const activeManagedProjects = registry.projects.filter((project) => (
      project.kind === "managed" && project.status === "active"
    ));

    if (activeManagedProjects.length === 0) {
      return [];
    }

    const inspector = new ProjectRepositoryIssueInspector(new GitHubClient(getGitHubConfig()));
    const settledStates = await Promise.all(
      activeManagedProjects.map(async (project) => {
        try {
          const repositoryState = await inspector.inspectProject(project);
          return {
            displayName: project.displayName,
            slug: project.slug,
            workspacePath: project.cwd,
            repositoryState,
          } satisfies PlannerManagedProjectState;
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown error";
          console.error(
            `[planner] Could not inspect managed project issue state for ${project.slug} (${project.executionRepo.owner}/${project.executionRepo.repo}): ${message}`,
          );
          return null;
        }
      }),
    );

    return settledStates.filter((state): state is PlannerManagedProjectState => state !== null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[planner] Could not read registered managed projects for issue gathering: ${message}`);
    return [];
  }
}

function buildPlannerPrompt(
  input: PlannerAgentInput,
  openIssues: IssueSummary[],
  recentClosedIssues: IssueSummary[],
  managedProjectStates: PlannerManagedProjectState[],
): string {
  const recentClosedIssueHistory = dedupeClosedIssueHistory(recentClosedIssues).slice(0, 25);

  return [
    "Inspect this repository and propose new GitHub issues for Evolvo.",
    "",
    "Requirements:",
    `- Return at most ${input.minimumIssueCount} issues.`,
    "- Each issue must be a small, concrete, repo-specific self-improvement task.",
    "- Base proposals on actual repository evidence, not canned templates.",
    "- Do not create follow-up titles.",
    "- Do not repeat or lightly reword existing open or recently closed issues.",
    "- Prefer reliability, runtime safety, validation quality, planning quality, and operational robustness.",
    "",
    "Current open issues:",
    formatIssueListForPrompt(openIssues),
    "",
    "Recently closed issues:",
    formatIssueListForPrompt(recentClosedIssueHistory),
    "",
    buildManagedProjectPromptSection(managedProjectStates),
    "",
    "- Use registered managed project issue state to gather work across all active projects, not just the default Evolvo repository.",
    "- If a managed project already has open repository issues, prefer turning that concrete project work into tracker issues rather than inventing unrelated generic ideas.",
    "",
    "Return only structured JSON matching the schema.",
  ].join("\n");
}

function summarizePlannerFailure(error: unknown): PlannerFailureArtifact["error"] {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "Unknown error.",
      stack: typeof error.stack === "string" && error.stack.trim().length > 0 ? error.stack : null,
    };
  }

  return {
    name: "NonErrorThrownValue",
    message: String(error),
    stack: null,
  };
}

async function persistPlannerFailureArtifact(options: {
  input: PlannerAgentInput;
  startupBootstrap: boolean;
  plannerPrompt: string | null;
  finalResponse: string | null;
  error: unknown;
}): Promise<string> {
  const failedAtMs = Date.now();
  const artifact: PlannerFailureArtifact = {
    schemaVersion: PLANNER_FAILURE_ARTIFACT_SCHEMA_VERSION,
    failedAtMs,
    failedAtIso: new Date(failedAtMs).toISOString(),
    cycle: options.input.cycle,
    openIssueCount: options.input.openIssueCount,
    minimumIssueCount: options.input.minimumIssueCount,
    maximumOpenIssues: options.input.maximumOpenIssues,
    startupBootstrap: options.startupBootstrap,
    plannerPrompt: options.plannerPrompt,
    finalResponse: options.finalResponse,
    error: summarizePlannerFailure(options.error),
  };
  await writeAtomicJsonState(
    join(options.input.workDir, PLANNER_FAILURE_ARTIFACT_RELATIVE_PATH),
    artifact,
  );
  return PLANNER_FAILURE_ARTIFACT_RELATIVE_PATH;
}

export async function runPlannerAgent(input: PlannerAgentInput): Promise<PlannerAgentResult> {
  const startupBootstrap = input.cycle === 1 && input.openIssueCount === 0;
  let plannerPrompt: string | null = null;
  let plannerFinalResponse: string | null = null;

  try {
    const openIssues = await input.issueManager.listOpenIssues();
    const recentClosedIssues = await input.issueManager.listRecentClosedIssues(
      PLANNED_ISSUE_RECENT_CLOSED_LOOKBACK_LIMIT,
    );
    const managedProjectStates = await inspectManagedProjectIssueState(input.workDir);
    plannerPrompt = buildPlannerPrompt(input, openIssues, recentClosedIssues, managedProjectStates);
    const plannerResult = await runPlannerOpenAi({
      apiKey: OPENAI_API_KEY,
      prompt: plannerPrompt,
      workDir: input.workDir,
    });
    plannerFinalResponse = plannerResult.finalResponse;
    const plannedIssues = parsePlannerResponse(plannerFinalResponse);
    const created = (
      await input.issueManager.createPlannedIssues({
        minimumIssueCount: input.minimumIssueCount,
        maximumOpenIssues: input.maximumOpenIssues,
        issues: plannedIssues,
      })
    ).created;

    return {
      created,
      startupBootstrap,
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Queue repository analysis failed during replenishment planning: ${error.message}`);
    } else {
      console.error("Queue repository analysis failed during replenishment planning with an unknown error.");
    }

    try {
      const artifactPath = await persistPlannerFailureArtifact({
        input,
        startupBootstrap,
        plannerPrompt,
        finalResponse: plannerFinalResponse,
        error,
      });
      console.error(`Planner replenishment failure artifact saved to \`${artifactPath}\`.`);
    } catch (artifactError) {
      if (artifactError instanceof Error) {
        console.error(
          `Could not persist planner replenishment failure artifact to \`${PLANNER_FAILURE_ARTIFACT_RELATIVE_PATH}\`: ${artifactError.message}`,
        );
      } else {
        console.error(
          `Could not persist planner replenishment failure artifact to \`${PLANNER_FAILURE_ARTIFACT_RELATIVE_PATH}\`: unknown error.`,
        );
      }
    }

    return {
      created: [],
      startupBootstrap,
    };
  }
}
