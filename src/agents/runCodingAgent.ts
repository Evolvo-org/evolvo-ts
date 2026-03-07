import { Agent, run } from "@openai/agents";
import { logToolCall } from "../logs/logToolCall";
import { stringifyOutput } from "../utils/string/stringifyOutput";

type LoggedRunResult = {
  applyPatchSeen: boolean;
};

function isFileEditRequest(prompt: string): boolean {
  return /\b(create|add|write|update|edit|modify|delete|remove)\b/i.test(prompt) &&
    /\b(file|files|src\/|\.ts|\.tsx|\.js|\.jsx|\.json|\.md)\b/i.test(prompt);
}

async function executeLoggedRun(
  codingAgent: Agent,
  prompt: string,
): Promise<LoggedRunResult> {
  console.log("=== Run starting ===");
  console.log(`[user] ${prompt}\n`);

  let applyPatchSeen = false;

  const result = await run(codingAgent, prompt, { stream: true });

  for await (const event of result) {
    if (event.type !== "run_item_stream_event") {
      continue;
    }

    const { item } = event;

    if (item.type === "tool_call_item") {
      const rawItem = item.rawItem as { type?: string; [key: string]: unknown };
      logToolCall(rawItem);
      continue;
    }

    if (item.type === "tool_call_output_item") {
      const rawItem = item.rawItem as { type?: string; [key: string]: unknown };
      const outputPreview = stringifyOutput(item.output);
      const isApplyPatch =
        rawItem.type === "apply_patch_call_output" ||
        outputPreview.startsWith("Created ") ||
        outputPreview.startsWith("Updated ") ||
        outputPreview.startsWith("Deleted ");

      if (isApplyPatch) {
        applyPatchSeen = true;
        console.log(`[apply_patch] ${outputPreview}\n`);
        continue;
      }

      console.log(`[tool output]\n${outputPreview}\n`);
      continue;
    }

    if (item.type === "message_output_item") {
      console.log(`[assistant]\n${item.content}\n`);
    }
  }

  await result.completed;

  console.log("=== Run complete ===\n");
  console.log("Final answer:\n");
  console.log(result.finalOutput ?? "");

  if (applyPatchSeen) {
    console.log("\n[apply_patch] One or more apply_patch calls were executed.");
    return { applyPatchSeen };
  }

  console.log("\n[apply_patch] No apply_patch calls detected in this run.");

  return { applyPatchSeen };
}

export async function runCodingAgent(
  codingAgent: Agent,
  prompt: string,
): Promise<void> {
  const expectsApplyPatch = isFileEditRequest(prompt);
  const firstRun = await executeLoggedRun(codingAgent, prompt);

  if (!expectsApplyPatch || firstRun.applyPatchSeen) {
    return;
  }

  const retryPrompt = `${prompt}

CRITICAL: This task requires a real repository edit. You must call apply_patch successfully.
Do not answer with inline code only. If apply_patch is not called, the task is incomplete.`;

  console.log("\n[apply_patch] Edit request detected but no apply_patch call was made. Retrying with a stricter prompt.\n");

  const retryRun = await executeLoggedRun(codingAgent, retryPrompt);

  if (retryRun.applyPatchSeen) {
    return;
  }

  throw new Error("The agent did not call apply_patch for a file-edit request.");
}
