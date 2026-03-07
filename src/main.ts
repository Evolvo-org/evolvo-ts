
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { WORK_DIR } from "./constants/workDir.js";
import { runCodingAgent } from "./agents/runCodingAgent.js";
import { runIssueCommand } from "./issues/runIssueCommand.js";
import { getGitHubConfig } from "./github/githubConfig.js";
import { GitHubApiError, GitHubClient } from "./github/githubClient.js";
import { TaskIssueManager, type IssueSummary } from "./issues/taskIssueManager.js";

export const DEFAULT_PROMPT = "No open issues available. Create an issue first.";

function hasLabel(issue: IssueSummary, label: string): boolean {
  return issue.labels.some((currentLabel) => currentLabel.toLowerCase() === label.toLowerCase());
}

function selectIssueForWork(issues: IssueSummary[]): IssueSummary | null {
  if (issues.length === 0) {
    return null;
  }

  const notCompleted = issues.filter((issue) => !hasLabel(issue, "completed"));
  const candidates = notCompleted.length > 0 ? notCompleted : issues;
  const inProgress = candidates.find((issue) => hasLabel(issue, "in progress"));

  return inProgress ?? candidates[0] ?? null;
}

function buildPromptFromIssue(issue: IssueSummary): string {
  const description = issue.description.trim() || "No description provided.";
  return `Issue #${issue.number}: ${issue.title}\n\n${description}`;
}

function logGitHubFallback(error: unknown): void {
  if (error instanceof GitHubApiError && error.status === 401) {
    console.error(
      "GitHub authentication failed. Check GITHUB_TOKEN and make sure it is a valid token for the configured repository.",
    );
    return;
  }

  if (error instanceof Error) {
    console.error(`GitHub issue sync unavailable: ${error.message}`);
    return;
  }

  console.error("GitHub issue sync unavailable due to an unknown error.");
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const issueCommandHandled = await runIssueCommand(args);
  if (issueCommandHandled) {
    return;
  }

  const { GITHUB_OWNER, GITHUB_REPO } = await import("./environment.js");
  let selectedIssue: IssueSummary | null = null;

  try {
    const issueManager = new TaskIssueManager(new GitHubClient(getGitHubConfig()));
    const openIssues = await issueManager.listOpenIssues();
    selectedIssue = selectIssueForWork(openIssues);

    if (selectedIssue && !hasLabel(selectedIssue, "in progress")) {
      const result = await issueManager.markInProgress(selectedIssue.number);
      if (!result.ok) {
        console.error(`Could not mark issue #${selectedIssue.number} as in progress: ${result.message}`);
      }
    }
  } catch (error) {
    logGitHubFallback(error);
  }

  if (!selectedIssue) {
    console.log(`Hello from ${GITHUB_OWNER}/${GITHUB_REPO}!`);
    console.log(`Working directory: ${WORK_DIR}`);
    console.log(DEFAULT_PROMPT);
    return;
  }

  const prompt = buildPromptFromIssue(selectedIssue);

  console.log(`Hello from ${GITHUB_OWNER}/${GITHUB_REPO}!`);
  console.log(`Working directory: ${WORK_DIR}`);
  console.log(`Prompt: ${prompt}`);

  await runCodingAgent(prompt).catch((error) => {
    console.error("Error running the coding agent:", error);
  });
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error("Error in main execution:", error);
  }).finally(() => {
    console.log("Execution finished.");
  });
}
