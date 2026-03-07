import { getGitHubConfig } from "../github/githubConfig.js";
import { GitHubApiError, GitHubClient } from "../github/githubClient.js";
import { TaskIssueManager } from "./taskIssueManager.js";

function parseIssueNumber(value: string | undefined): number {
  const rawValue = value ?? "";
  if (!/^\d+$/.test(rawValue)) {
    throw new Error("Issue number must be a positive integer.");
  }

  const issueNumber = Number(rawValue);

  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error("Issue number must be a positive integer.");
  }

  return issueNumber;
}

function printIssueList(issues: Awaited<ReturnType<TaskIssueManager["listOpenIssues"]>>): void {
  if (issues.length === 0) {
    console.log("No open issues found.");
    return;
  }

  for (const issue of issues) {
    const labels = issue.labels.length > 0 ? ` [${issue.labels.join(", ")}]` : "";
    console.log(`#${issue.number} ${issue.title}${labels}`);
  }
}

export function getIssueUsage(): string {
  return [
    "Issue commands:",
    "  issues create <title> <description>",
    "  issues list",
    "  issues start <issueNumber>",
    "  issues comment <issueNumber> <comment>",
    "  issues complete <issueNumber> <finalSummary>",
    "  issues close <issueNumber>",
  ].join("\n");
}

export async function runIssueCommand(args: string[]): Promise<boolean> {
  if (args[0] !== "issues") {
    return false;
  }

  const manager = new TaskIssueManager(new GitHubClient(getGitHubConfig()));
  const command = args[1];

  try {
    if (command === "create") {
      const title = args[2] ?? "";
      const description = args.slice(3).join(" ");
      const result = await manager.createIssue(title, description);
      console.log(result.message);
      return true;
    }

    if (command === "list") {
      const issues = await manager.listOpenIssues();
      printIssueList(issues);
      return true;
    }

    if (command === "start") {
      const issueNumber = parseIssueNumber(args[2]);
      const result = await manager.markInProgress(issueNumber);
      console.log(result.message);
      return true;
    }

    if (command === "comment") {
      const issueNumber = parseIssueNumber(args[2]);
      const comment = args.slice(3).join(" ");
      const result = await manager.addProgressComment(issueNumber, comment);
      console.log(result.message);
      return true;
    }

    if (command === "complete") {
      const issueNumber = parseIssueNumber(args[2]);
      const summary = args.slice(3).join(" ");
      const result = await manager.markCompleted(issueNumber, summary);
      console.log(result.message);
      return true;
    }

    if (command === "close") {
      const issueNumber = parseIssueNumber(args[2]);
      const result = await manager.closeIssue(issueNumber);
      console.log(result.message);
      return true;
    }

    console.log(getIssueUsage());
    return true;
  } catch (error) {
    if (error instanceof GitHubApiError) {
      console.error(error.message);
      return true;
    }

    if (error instanceof Error) {
      console.error(error.message);
      return true;
    }

    console.error("Unknown error while handling issue command.");
    return true;
  }
}
