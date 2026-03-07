import { exec } from "node:child_process";
import { promisify } from "node:util";
import { shellTool, type Shell, type ShellAction, type ShellResult } from "@openai/agents";
import { WORK_DIR } from "../constants/workDir";

const execAsync = promisify(exec);

export const shell: Shell = {
  run: async (action: ShellAction): Promise<ShellResult> => {
    const output: ShellResult["output"] = [];

    for (const command of action.commands) {
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: WORK_DIR,
          env: process.env,
          timeout: action.timeoutMs,
          maxBuffer: Math.max(action.maxOutputLength ?? 1024 * 1024, 1024 * 1024),
        });

        output.push({
          stdout: stdout,
          stderr: stderr,
          outcome: { type: "exit", exitCode: 0 },
        });
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }

        const shellError = error as Error & {
          code?: number | string | null;
          killed?: boolean;
          signal?: NodeJS.Signals | null;
          stdout?: string;
          stderr?: string;
        };

        const timedOut = shellError.killed && shellError.signal === "SIGTERM";

        output.push({
          stdout: shellError.stdout ?? "",
          stderr: shellError.stderr ?? shellError.message,
          outcome: timedOut
            ? { type: "timeout" }
            : {
                type: "exit",
                exitCode: typeof shellError.code === "number" ? shellError.code : null,
              },
        });

        if (timedOut) {
          break;
        }
      }
    }

    return {
      output,
      maxOutputLength: action.maxOutputLength,
      providerData: {
        workingDirectory: WORK_DIR,
      },
    };
  },
};


export const shellToolAction = shellTool({ shell, needsApproval: false })