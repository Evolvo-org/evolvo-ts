import { Codex } from "@openai/codex-sdk";
import { DEFAULT_RELEASE_AGENT_MODEL, buildReleaseAgentThreadOptions, buildReleasePrompt } from "./releaseAgent.js";

const codex = new Codex();

export type ReleaseAgentRunResult = {
  mergedPullRequest: boolean;
  finalResponse: string;
};

export async function runReleaseAgent(options: {
  workDir: string;
  pullRequestUrl: string;
  defaultBranch: string | null;
}): Promise<ReleaseAgentRunResult> {
  const thread = codex.startThread(buildReleaseAgentThreadOptions(options.workDir));
  const { events } = await thread.runStreamed(buildReleasePrompt({
    pullRequestUrl: options.pullRequestUrl,
    defaultBranch: options.defaultBranch,
  }));

  let mergedPullRequest = false;
  let finalResponse = "";

  for await (const event of events) {
    if (event.type === "item.completed" && event.item.type === "command_execution") {
      const normalizedCommand = event.item.command.trim().toLowerCase();
      if (event.item.exit_code === 0 && normalizedCommand.startsWith("gh pr merge")) {
        mergedPullRequest = true;
      }
    }

    if (
      (event.type === "item.updated" || event.type === "item.completed")
      && event.item.type === "agent_message"
    ) {
      finalResponse = event.item.text;
    }

    if (event.type === "turn.failed") {
      throw new Error(event.error.message);
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  return {
    mergedPullRequest,
    finalResponse,
  };
}

export { DEFAULT_RELEASE_AGENT_MODEL };
