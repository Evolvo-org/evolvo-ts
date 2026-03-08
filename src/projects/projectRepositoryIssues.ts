import { GitHubClient } from "../github/githubClient.js";
import type { IssueSummary } from "../issues/taskIssueManager.js";
import type { ProjectRecord } from "./projectRegistry.js";

const ISSUES_PER_PAGE = 100;
const DEFAULT_RECENT_CLOSED_LIMIT = 10;
const ISSUE_SAMPLE_LIMIT = 5;

type GitHubLabel = {
  name: string;
};

type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: GitHubLabel[];
  pull_request?: unknown;
};

export type ProjectRepositoryIssueState = {
  projectSlug: string;
  repository: {
    owner: string;
    repo: string;
    reference: string;
    url: string;
  };
  openIssues: IssueSummary[];
  recentClosedIssues: IssueSummary[];
};

function formatIssue(issue: GitHubIssue): IssueSummary {
  return {
    number: issue.number,
    title: issue.title,
    description: issue.body ?? "",
    state: issue.state,
    labels: issue.labels.map((label) => label.name),
  };
}

function formatRepositoryReference(repository: { owner: string; repo: string }): string {
  return `${repository.owner}/${repository.repo}`;
}

function buildRepositoryIssuesPath(
  repository: { owner: string; repo: string },
  query: URLSearchParams,
): string {
  const owner = encodeURIComponent(repository.owner);
  const repo = encodeURIComponent(repository.repo);
  return `/repos/${owner}/${repo}/issues?${query.toString()}`;
}

async function listRepositoryOpenIssues(
  client: GitHubClient,
  repository: { owner: string; repo: string },
): Promise<IssueSummary[]> {
  const issues: IssueSummary[] = [];
  let page = 1;

  while (true) {
    const query = new URLSearchParams({
      state: "open",
      per_page: String(ISSUES_PER_PAGE),
      page: String(page),
    });
    const batch = await client.getApi<GitHubIssue[]>(buildRepositoryIssuesPath(repository, query));
    issues.push(...batch.filter((issue) => issue.pull_request === undefined).map(formatIssue));

    if (batch.length < ISSUES_PER_PAGE) {
      break;
    }

    page += 1;
  }

  return issues;
}

async function listRepositoryRecentClosedIssues(
  client: GitHubClient,
  repository: { owner: string; repo: string },
  limit: number,
): Promise<IssueSummary[]> {
  const requestedLimit = Math.max(1, Math.floor(limit));
  const perPage = Math.max(1, Math.min(ISSUES_PER_PAGE, requestedLimit));
  const issues: IssueSummary[] = [];
  let page = 1;

  while (issues.length < requestedLimit) {
    const query = new URLSearchParams({
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: String(perPage),
      page: String(page),
    });
    const batch = await client.getApi<GitHubIssue[]>(buildRepositoryIssuesPath(repository, query));
    issues.push(...batch.filter((issue) => issue.pull_request === undefined).map(formatIssue));

    if (batch.length < perPage) {
      break;
    }

    page += 1;
  }

  return issues.slice(0, requestedLimit);
}

function formatIssueSample(issues: IssueSummary[]): string {
  if (issues.length === 0) {
    return "none";
  }

  const sample = issues.slice(0, ISSUE_SAMPLE_LIMIT).map((issue) => `#${issue.number} ${issue.title}`);
  const remainingCount = issues.length - sample.length;
  return remainingCount > 0 ? `${sample.join("; ")}; +${remainingCount} more` : sample.join("; ");
}

function formatPromptIssueList(issues: IssueSummary[]): string[] {
  if (issues.length === 0) {
    return ["- none"];
  }

  return issues.slice(0, ISSUE_SAMPLE_LIMIT).map((issue) => `- #${issue.number} ${issue.title}`);
}

export class ProjectRepositoryIssueInspector {
  public constructor(private readonly client: GitHubClient) {}

  public async inspectProject(
    project: ProjectRecord,
    options: { recentClosedLimit?: number } = {},
  ): Promise<ProjectRepositoryIssueState> {
    const repository = {
      owner: project.executionRepo.owner,
      repo: project.executionRepo.repo,
    };
    const recentClosedLimit = Math.max(1, Math.floor(options.recentClosedLimit ?? DEFAULT_RECENT_CLOSED_LIMIT));
    const [openIssues, recentClosedIssues] = await Promise.all([
      listRepositoryOpenIssues(this.client, repository),
      listRepositoryRecentClosedIssues(this.client, repository, recentClosedLimit),
    ]);

    return {
      projectSlug: project.slug,
      repository: {
        ...repository,
        reference: formatRepositoryReference(repository),
        url: project.executionRepo.url,
      },
      openIssues,
      recentClosedIssues,
    };
  }
}

export function buildProjectRepositoryIssueInspectionLogLines(state: ProjectRepositoryIssueState): string[] {
  return [
    `[project-issues] inspected project=${state.projectSlug} repository=${state.repository.reference} open=${state.openIssues.length} recentClosed=${state.recentClosedIssues.length}`,
    `[project-issues] open sample for ${state.repository.reference}: ${formatIssueSample(state.openIssues)}`,
    `[project-issues] recent closed sample for ${state.repository.reference}: ${formatIssueSample(state.recentClosedIssues)}`,
  ];
}

export function buildProjectRepositoryIssuePromptSection(state: ProjectRepositoryIssueState): string {
  return [
    "## Project Repository Issue State",
    `- Project repository: ${state.repository.reference}`,
    `- Project repository URL: ${state.repository.url}`,
    "- Use this project-repository issue state to avoid duplicating work, resume existing project threads, and align planning with the managed repository rather than treating the tracker issue queue as the only source of truth.",
    "- Open project repository issues:",
    ...formatPromptIssueList(state.openIssues),
    "- Recent closed project repository issues:",
    ...formatPromptIssueList(state.recentClosedIssues),
  ].join("\n");
}
