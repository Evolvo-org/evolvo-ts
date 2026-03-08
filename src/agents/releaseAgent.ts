import type { ThreadOptions } from "@openai/codex-sdk";
import { WORK_DIR } from "../constants/workDir.js";

export const DEFAULT_RELEASE_AGENT_MODEL = "gpt-5.3-codex";

export const RELEASE_AGENT_THREAD_OPTIONS: ThreadOptions = {
  model: DEFAULT_RELEASE_AGENT_MODEL,
  sandboxMode: "workspace-write",
  workingDirectory: WORK_DIR,
  skipGitRepoCheck: true,
  networkAccessEnabled: true,
  webSearchEnabled: false,
  approvalPolicy: "never",
};

export function buildReleaseAgentThreadOptions(workDir: string): ThreadOptions {
  return {
    ...RELEASE_AGENT_THREAD_OPTIONS,
    workingDirectory: workDir,
  };
}

export function buildReleasePrompt(options: {
  pullRequestUrl: string;
  defaultBranch: string | null;
}): string {
  return [
    "You are Evolvo's Release agent.",
    "Only the Release agent may move work from Ready for Release to Releasing and then to Done.",
    "You are responsible only for release-time work.",
    "Your task is to merge the supplied pull request and handle merge-conflict situations if they appear.",
    "Do not implement new feature work.",
    "Do not reopen planning or review.",
    "If the pull request can be merged safely, merge it.",
    "If merge conflicts or release blockers exist, surface them clearly and stop.",
    "",
    `Pull request URL: ${options.pullRequestUrl}`,
    `Target default branch: ${options.defaultBranch ?? "repository default branch"}`,
  ].join("\n");
}
