import { GitHubApiError, GitHubClient } from "../github/githubClient.js";

const IN_PROGRESS_LABEL = "in progress";
const COMPLETED_LABEL = "completed";

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

export type IssueSummary = {
  number: number;
  title: string;
  description: string;
  state: "open" | "closed";
  labels: string[];
};

export type IssueActionResult = {
  ok: boolean;
  message: string;
  issue?: IssueSummary;
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

function hasLabel(issue: GitHubIssue, labelName: string): boolean {
  return issue.labels.some((label) => label.name.toLowerCase() === labelName.toLowerCase());
}

function buildLabels(issue: GitHubIssue, options: { inProgress: boolean; completed: boolean }): string[] {
  const names = issue.labels.map((label) => label.name);
  const withoutManaged = names.filter(
    (name) => name.toLowerCase() !== IN_PROGRESS_LABEL && name.toLowerCase() !== COMPLETED_LABEL,
  );

  if (options.inProgress) {
    withoutManaged.push(IN_PROGRESS_LABEL);
  }

  if (options.completed) {
    withoutManaged.push(COMPLETED_LABEL);
  }

  return withoutManaged;
}

export class TaskIssueManager {
  private static readonly ISSUES_PER_PAGE = 100;

  public constructor(private readonly client: GitHubClient) {}

  public async createIssue(title: string, description: string): Promise<IssueActionResult> {
    if (!title.trim()) {
      return { ok: false, message: "Issue title is required." };
    }

    const created = await this.client.post<GitHubIssue>("", {
      title: title.trim(),
      body: description.trim(),
    });

    return {
      ok: true,
      message: `Created issue #${created.number}.`,
      issue: formatIssue(created),
    };
  }

  public async listOpenIssues(): Promise<IssueSummary[]> {
    const issues: GitHubIssue[] = [];
    let page = 1;

    while (true) {
      const batch = await this.client.get<GitHubIssue[]>(
        `?state=open&per_page=${TaskIssueManager.ISSUES_PER_PAGE}&page=${page}`,
      );
      issues.push(...batch);

      if (batch.length < TaskIssueManager.ISSUES_PER_PAGE) {
        break;
      }

      page += 1;
    }

    return issues.filter((issue) => issue.pull_request === undefined).map(formatIssue);
  }

  public async markInProgress(issueNumber: number): Promise<IssueActionResult> {
    const issue = await this.getIssue(issueNumber);

    if (!issue) {
      return { ok: false, message: `Issue #${issueNumber} was not found.` };
    }

    if (issue.state === "closed") {
      return { ok: false, message: `Issue #${issueNumber} is closed and cannot be started.` };
    }

    if (hasLabel(issue, IN_PROGRESS_LABEL)) {
      return { ok: false, message: `Issue #${issueNumber} is already in progress.` };
    }

    const updated = await this.client.patch<GitHubIssue>(`/${issueNumber}`, {
      labels: buildLabels(issue, { inProgress: true, completed: false }),
    });

    return {
      ok: true,
      message: `Issue #${issueNumber} marked as in progress.`,
      issue: formatIssue(updated),
    };
  }

  public async addProgressComment(issueNumber: number, comment: string): Promise<IssueActionResult> {
    const trimmedComment = comment.trim();
    if (!trimmedComment) {
      return { ok: false, message: "Progress comment cannot be empty." };
    }

    const issue = await this.getIssue(issueNumber);

    if (!issue) {
      return { ok: false, message: `Issue #${issueNumber} was not found.` };
    }

    if (issue.state === "closed") {
      return { ok: false, message: `Issue #${issueNumber} is closed and cannot be updated.` };
    }

    await this.client.post(`/${issueNumber}/comments`, { body: trimmedComment });

    return {
      ok: true,
      message: `Added progress comment to issue #${issueNumber}.`,
      issue: formatIssue(issue),
    };
  }

  public async markCompleted(issueNumber: number, summary: string): Promise<IssueActionResult> {
    const trimmedSummary = summary.trim();
    if (!trimmedSummary) {
      return { ok: false, message: "Completion summary cannot be empty." };
    }

    const issue = await this.getIssue(issueNumber);

    if (!issue) {
      return { ok: false, message: `Issue #${issueNumber} was not found.` };
    }

    if (issue.state === "closed") {
      return { ok: false, message: `Issue #${issueNumber} is closed and cannot be completed.` };
    }

    if (hasLabel(issue, COMPLETED_LABEL)) {
      return { ok: false, message: `Issue #${issueNumber} is already marked as completed.` };
    }

    await this.client.post(`/${issueNumber}/comments`, { body: trimmedSummary });
    const updated = await this.client.patch<GitHubIssue>(`/${issueNumber}`, {
      labels: buildLabels(issue, { inProgress: false, completed: true }),
    });

    return {
      ok: true,
      message: `Issue #${issueNumber} marked as completed.`,
      issue: formatIssue(updated),
    };
  }

  public async closeIssue(issueNumber: number): Promise<IssueActionResult> {
    const issue = await this.getIssue(issueNumber);

    if (!issue) {
      return { ok: false, message: `Issue #${issueNumber} was not found.` };
    }

    if (issue.state === "closed") {
      return { ok: false, message: `Issue #${issueNumber} is already closed.` };
    }

    await this.client.patch<GitHubIssue>(`/${issueNumber}`, { state: "closed" });

    return {
      ok: true,
      message: `Issue #${issueNumber} closed successfully.`,
      issue: formatIssue({ ...issue, state: "closed" }),
    };
  }

  private async getIssue(issueNumber: number): Promise<GitHubIssue | null> {
    try {
      const issue = await this.client.get<GitHubIssue>(`/${issueNumber}`);
      if (issue.pull_request !== undefined) {
        return null;
      }

      return issue;
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }
}

export { COMPLETED_LABEL, IN_PROGRESS_LABEL };
