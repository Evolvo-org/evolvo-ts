
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { WORK_DIR } from "./constants/workDir.js";
import { runCodingAgent } from "./agents/runCodingAgent.js";
import { runIssueCommand } from "./issues/runIssueCommand.js";

export const DEFAULT_PROMPT = `Now you have the ability to read and write issues
    You need to move to a system where you dont get a prompt. instead you load the issues available and decide which one to work on, then use that issue as your prompt.
    `;

export async function main(): Promise<void> {

  const { GITHUB_OWNER, GITHUB_REPO } = await import("./environment.js");
  const prompt = DEFAULT_PROMPT;

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
