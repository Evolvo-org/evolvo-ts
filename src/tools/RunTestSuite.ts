import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tool } from "@openai/agents";

const execFileAsync = promisify(execFile);

const runTestSuiteParameters = {
  type: "object",
  properties: {
    testTarget: {
      type: "string",
      description:
        "File path or Vitest filter to run a narrower subset of tests. Pass an empty string to run the full suite.",
    },
  },
  required: ["testTarget"] as string[],
  additionalProperties: false,
} as const;

function formatCommand(testTarget?: string): string {
  return testTarget ? `pnpm test -- ${testTarget}` : "pnpm test";
}

function buildOutput(args: {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  success: boolean;
}): string {
  const stdout = args.stdout.trim();
  const stderr = args.stderr.trim();

  return [
    `success: ${args.success}`,
    `command: ${args.command}`,
    `exitCode: ${args.exitCode ?? "unknown"}`,
    stdout ? `stdout:\n${stdout}` : "stdout:\n<empty>",
    stderr ? `stderr:\n${stderr}` : "stderr:\n<empty>",
  ].join("\n\n");
}

export const runTestSuiteTool = tool({
  name: "run_test_suite",
  description:
    "Run the project's Vitest test suite and return whether it passed along with stdout and stderr. Pass an empty testTarget to run the full suite.",
  parameters: runTestSuiteParameters,
  async execute(input) {
    const normalizedTestTarget =
      typeof (input as { testTarget?: string }).testTarget === "string"
        ? (input as { testTarget: string }).testTarget.trim()
        : "";
    const args = normalizedTestTarget ? ["test", "--", normalizedTestTarget] : ["test"];
    const command = formatCommand(normalizedTestTarget);

    try {
      const { stdout, stderr } = await execFileAsync("pnpm", args, {
        cwd: process.cwd(),
        env: process.env,
        maxBuffer: 1024 * 1024 * 10,
      });

      return buildOutput({
        command,
        stdout,
        stderr,
        exitCode: 0,
        success: true,
      });
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }

      const execError = error as Error & {
        code?: number | null;
        stdout?: string;
        stderr?: string;
      };

      return buildOutput({
        command,
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? execError.message,
        exitCode: typeof execError.code === "number" ? execError.code : null,
        success: false,
      });
    }
  },
});
