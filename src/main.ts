
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { GITHUB_OWNER, GITHUB_REPO } from "./environment.js";
import { WORK_DIR } from "./constants/workDir.js";
import { runCodingAgent } from "./agents/runCodingAgent.js";

export const DEFAULT_PROMPT = `Create a system that allows you to manage tasks through github issues.
    The system should have the following features:
    - Create a new issue with a title and description.
    - List all open issues.
    - Choose an issue to work on and mark it as in progress.
    - Add comments to the issue with updates on the progress.
    - Mark the issue as completed when the task is done with a final comment summarizing the work.
    - Close an issue by its number.

    Make sure to handle edge cases, such as trying to work on an issue that is already in progress or closed, and provide appropriate feedback in those cases.
    Make sure all interactions with the GitHub API are properly authenticated and handle any potential errors gracefully.

    Pay attention to what .env variables are needed for authentication and API access, and ensure that they are used securely in your implementation adn what .env variables are already available.

    Make sure all files have applicable tests and no regressions.
    `;

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const prompt = args.join(" ").trim() || DEFAULT_PROMPT;

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
