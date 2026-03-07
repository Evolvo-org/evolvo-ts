import { Codex, Thread, type ThreadItem } from "@openai/codex-sdk";
import {
  CODING_AGENT_THREAD_OPTIONS,
  buildCodingPrompt,
} from "./codingAgent.js";

const codex = new Codex();
let activeThread: Thread | null = null;
const MERGE_PR_COMMAND_PATTERN = /\bgh\s+pr\s+merge\b/i;
const MERGE_PR_MESSAGE_PATTERN = /\bmerged (the )?pull request\b|\bmerged .* into main\b/i;
const CREATE_PR_COMMAND_PATTERN = /\bgh\s+pr\s+create\b/i;
const GITHUB_REPOSITORY_URL_PATTERN = /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\.git)?(?:\/)?/gi;
const GITHUB_PULL_REQUEST_URL_PATTERN = /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/\d+/gi;
const INSPECTION_COMMAND_PATTERN = /\b(rg|grep|cat|sed|ls|find|fd|tree|git\s+status|git\s+diff|git\s+show)\b/i;
const VALIDATION_COMMAND_PATTERN = /\b(validate|test|vitest|jest|typecheck|lint|build|tsc|pytest|go test|cargo test)\b/i;

export type CodingAgentRunResult = {
  mergedPullRequest: boolean;
  summary: CodingAgentRunSummary;
};

type CommandExecutionLogDetails = {
  startedAtMs?: number;
};

export type CommandExecutionSummary = {
  command: string;
  commandName: string;
  exitCode: number | null;
  durationMs: number | null;
};

export type CodingAgentRunSummary = {
  inspectedAreas: string[];
  editedFiles: string[];
  validationCommands: CommandExecutionSummary[];
  failedValidationCommands: CommandExecutionSummary[];
  reviewOutcome: "accepted" | "amended";
  pullRequestCreated: boolean;
  externalRepositories: string[];
  externalPullRequests: string[];
  mergedExternalPullRequest: boolean;
  finalResponse: string;
};

function getThread(): Thread {
  if (!activeThread) {
    activeThread = codex.startThread(CODING_AGENT_THREAD_OPTIONS);
  }

  return activeThread;
}

function isFileEditRequest(prompt: string): boolean {
  return /\b(create|add|write|update|edit|modify|delete|remove)\b/i.test(prompt) &&
    /\b(file|files|src\/|\.ts|\.tsx|\.js|\.jsx|\.json|\.md)\b/i.test(prompt);
}

function formatFileChanges(item: Extract<ThreadItem, { type: "file_change" }>): string {
  return item.changes.map((change) => `${change.kind} ${change.path}`).join(", ");
}

function getCommandName(command: string): string {
  const [commandName] = command.trim().split(/\s+/, 1);
  return commandName || "unknown";
}

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) {
    return "unknown";
  }

  return `${Math.round(durationMs)}ms`;
}

function getCommandDurationMs(itemId: string, commandStartTimes: Map<string, number>): number | null {
  const startedAtMs = commandStartTimes.get(itemId);
  if (startedAtMs === undefined) {
    return null;
  }

  const durationMs = Date.now() - startedAtMs;
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  return durationMs;
}

function extractCommandTargets(command: string): string[] {
  const targets = new Set<string>();
  for (const rawToken of command.split(/\s+/)) {
    const token = rawToken.trim();
    if (!token || token.startsWith("-")) {
      continue;
    }

    if (
      token.startsWith("src/") ||
      token.startsWith("./") ||
      token.startsWith("../") ||
      /\.(ts|tsx|js|jsx|json|md|yml|yaml|sh)$/i.test(token)
    ) {
      targets.add(token.replace(/[",':;]+$/g, ""));
    }
  }

  return [...targets];
}

function summarizeReviewOutcome(validationCommands: CommandExecutionSummary[]): "accepted" | "amended" {
  return validationCommands.some((command) => command.exitCode !== 0) ? "amended" : "accepted";
}

function normalizeRepositoryUrl(url: string): string {
  const cleanUrl = url.trim().replace(/\/+$/, "");
  return cleanUrl.endsWith(".git") ? cleanUrl.slice(0, -4) : cleanUrl;
}

function extractGitHubRepositoryUrls(text: string): string[] {
  const urls = new Set<string>();
  const matches = text.matchAll(GITHUB_REPOSITORY_URL_PATTERN);

  for (const match of matches) {
    urls.add(normalizeRepositoryUrl(match[0]));
  }

  return [...urls];
}

function extractGitHubPullRequestUrls(text: string): string[] {
  const urls = new Set<string>();
  const matches = text.matchAll(GITHUB_PULL_REQUEST_URL_PATTERN);

  for (const match of matches) {
    urls.add(match[0].replace(/\/+$/, ""));
  }

  return [...urls];
}

function getConfiguredRepositoryUrl(): string | null {
  const owner = process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  if (!owner || !repo) {
    return null;
  }

  return `https://github.com/${owner}/${repo}`;
}

function isExternalRepositoryUrl(url: string, configuredRepositoryUrl: string | null): boolean {
  if (!configuredRepositoryUrl) {
    return true;
  }

  return normalizeRepositoryUrl(url).toLowerCase() !== normalizeRepositoryUrl(configuredRepositoryUrl).toLowerCase();
}

function logCompletedItem(item: ThreadItem, details?: CommandExecutionLogDetails): void {
  if (item.type === "file_change") {
    console.log(`[file_change] ${formatFileChanges(item)}\n`);
    return;
  }

  if (item.type === "command_execution") {
    const output = item.aggregated_output.trim();
    const commandName = getCommandName(item.command);
    const exitCode = item.exit_code ?? "unknown";
    const duration = details?.startedAtMs !== undefined
      ? formatDuration(Date.now() - details.startedAtMs)
      : "unknown";

    console.log(
      `[command completed] command="${item.command}" name=${commandName} exit=${exitCode} duration=${duration}`,
    );

    if (output) {
      console.log(`${output}\n`);
    } else {
      console.log("");
    }

    return;
  }

  if (item.type === "agent_message") {
    console.log(`[assistant]\n${item.text}\n`);
  }
}

function logStartedItem(item: ThreadItem): void {
  if (item.type === "command_execution") {
    console.log(`[command] ${item.command}`);
    return;
  }

  if (item.type === "mcp_tool_call") {
    console.log(`[tool] mcp - ${item.server}.${item.tool}`);
    return;
  }

  if (item.type === "web_search") {
    console.log(`[tool] web_search - query: ${item.query}`);
  }
}

export async function runCodingAgent(prompt: string): Promise<CodingAgentRunResult> {
  console.log("=== Run starting ===");
  console.log(`[user] ${prompt}\n`);

  const thread = getThread();
  const { events } = await thread.runStreamed(buildCodingPrompt(prompt));

  const startedItems = new Set<string>();
  const completedItems = new Set<string>();
  const commandStartTimes = new Map<string, number>();
  const inspectedAreas = new Set<string>();
  const editedFiles = new Set<string>();
  const externalRepositories = new Set<string>();
  const externalPullRequests = new Set<string>();
  const validationCommands: CommandExecutionSummary[] = [];
  const failedValidationCommands: CommandExecutionSummary[] = [];
  let fileChangeSeen = false;
  let mergedPullRequest = false;
  let mergedExternalPullRequest = false;
  let pullRequestCreated = false;
  let finalResponse = "";
  const configuredRepositoryUrl = getConfiguredRepositoryUrl();

  function captureExternalReferences(text: string): void {
    for (const repositoryUrl of extractGitHubRepositoryUrls(text)) {
      if (isExternalRepositoryUrl(repositoryUrl, configuredRepositoryUrl)) {
        externalRepositories.add(repositoryUrl);
      }
    }

    for (const pullRequestUrl of extractGitHubPullRequestUrls(text)) {
      const pullRequestRepositoryUrl = pullRequestUrl.replace(/\/pull\/\d+$/, "");
      if (isExternalRepositoryUrl(pullRequestRepositoryUrl, configuredRepositoryUrl)) {
        externalPullRequests.add(pullRequestUrl);
        externalRepositories.add(pullRequestRepositoryUrl);
        if (MERGE_PR_MESSAGE_PATTERN.test(text)) {
          mergedExternalPullRequest = true;
        }
      }
    }
  }

  for await (const event of events) {
    if (event.type === "item.started") {
      if (startedItems.has(event.item.id)) {
        continue;
      }

      startedItems.add(event.item.id);
      if (event.item.type === "command_execution") {
        commandStartTimes.set(event.item.id, Date.now());
      }
      logStartedItem(event.item);
      continue;
    }

    if (event.type === "item.updated") {
      if (event.item.type === "agent_message") {
        finalResponse = event.item.text;
        captureExternalReferences(event.item.text);
        if (MERGE_PR_MESSAGE_PATTERN.test(event.item.text)) {
          mergedPullRequest = true;
        }
      }
      continue;
    }

    if (event.type === "item.completed") {
      if (completedItems.has(event.item.id)) {
        continue;
      }

      completedItems.add(event.item.id);

      if (event.item.type === "file_change" && event.item.status === "completed") {
        fileChangeSeen = true;
      }

      if (event.item.type === "agent_message") {
        finalResponse = event.item.text;
        captureExternalReferences(event.item.text);
        if (MERGE_PR_MESSAGE_PATTERN.test(event.item.text)) {
          mergedPullRequest = true;
        }
      }

      if (
        event.item.type === "command_execution" &&
        event.item.exit_code === 0 &&
        MERGE_PR_COMMAND_PATTERN.test(event.item.command)
      ) {
        mergedPullRequest = true;
        if (externalPullRequests.size > 0) {
          mergedExternalPullRequest = true;
        }
      }

      if (event.item.type === "command_execution" && CREATE_PR_COMMAND_PATTERN.test(event.item.command)) {
        pullRequestCreated = true;
      }
      if (event.item.type === "command_execution") {
        captureExternalReferences(event.item.command);
        captureExternalReferences(event.item.aggregated_output);
      }

      if (event.item.type === "command_execution" && INSPECTION_COMMAND_PATTERN.test(event.item.command)) {
        for (const target of extractCommandTargets(event.item.command)) {
          inspectedAreas.add(target);
        }
      }

      if (event.item.type === "command_execution" && VALIDATION_COMMAND_PATTERN.test(event.item.command)) {
        const commandSummary: CommandExecutionSummary = {
          command: event.item.command,
          commandName: getCommandName(event.item.command),
          exitCode: event.item.exit_code ?? null,
          durationMs: getCommandDurationMs(event.item.id, commandStartTimes),
        };
        validationCommands.push(commandSummary);
        if (commandSummary.exitCode !== 0) {
          failedValidationCommands.push(commandSummary);
        }
      }

      const details = event.item.type === "command_execution"
        ? { startedAtMs: commandStartTimes.get(event.item.id) }
        : undefined;
      if (event.item.type === "command_execution") {
        commandStartTimes.delete(event.item.id);
      }

      if (event.item.type === "file_change" && event.item.status === "completed") {
        for (const change of event.item.changes) {
          editedFiles.add(change.path);
        }
      }

      logCompletedItem(event.item, details);
      continue;
    }

    if (event.type === "turn.failed") {
      throw new Error(event.error.message);
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  console.log("=== Run complete ===\n");
  console.log("Final answer:\n");
  console.log(finalResponse);

  if (fileChangeSeen) {
    console.log("\n[file_change] One or more repository edits were executed.");
    return {
      mergedPullRequest,
      summary: {
        inspectedAreas: [...inspectedAreas],
        editedFiles: [...editedFiles],
        validationCommands,
        failedValidationCommands,
        reviewOutcome: summarizeReviewOutcome(validationCommands),
        pullRequestCreated,
        externalRepositories: [...externalRepositories],
        externalPullRequests: [...externalPullRequests],
        mergedExternalPullRequest,
        finalResponse,
      },
    };
  }

  console.log("\n[file_change] No repository edits were detected.");

  if (isFileEditRequest(prompt)) {
    throw new Error("The Codex run did not make repository edits for a file-edit request.");
  }

  return {
    mergedPullRequest,
    summary: {
      inspectedAreas: [...inspectedAreas],
      editedFiles: [...editedFiles],
      validationCommands,
      failedValidationCommands,
      reviewOutcome: summarizeReviewOutcome(validationCommands),
      pullRequestCreated,
      externalRepositories: [...externalRepositories],
      externalPullRequests: [...externalPullRequests],
      mergedExternalPullRequest,
      finalResponse,
    },
  };
}
