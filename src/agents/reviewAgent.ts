import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CommandExecutionSummary } from "./runCodingAgent.js";
import { extractResponseOutputText } from "./extractResponseOutputText.js";
import { resolveRepositoryDefaultBranch } from "../runtime/defaultBranch.js";

const execFileAsync = promisify(execFile);
const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";
export const REVIEW_OPENAI_MODEL = "gpt-5.4";
const MAX_DIFF_CHARACTERS = 20_000;

export type ReviewAgentInput = {
  apiKey: string;
  workDir: string;
  issue: {
    number: number;
    title: string;
    description: string;
  };
  pullRequestUrl: string | null;
  validationCommands: CommandExecutionSummary[];
  failedValidationCommands: CommandExecutionSummary[];
  implementationSummary: string;
};

export type ReviewAgentResult = {
  decision: "approve" | "reject";
  summary: string;
  reasons: string[];
  finalResponse: string;
};

type ReviewAgentResponse = {
  decision?: unknown;
  summary?: unknown;
  reasons?: unknown;
};

function formatValidationCommands(commands: CommandExecutionSummary[]): string {
  if (commands.length === 0) {
    return "- none";
  }

  return commands.map((command) =>
    `- ${command.command} (exit=${command.exitCode ?? "unknown"}, duration=${command.durationMs ?? "unknown"}ms)`
  ).join("\n");
}

async function readGitDiff(workDir: string, baseBranch: string): Promise<{ stat: string; diff: string }> {
  const baseRef = `origin/${baseBranch}...HEAD`;
  const stat = await execFileAsync("git", ["diff", "--stat", "--find-renames", baseRef], { cwd: workDir })
    .then((result) => result.stdout.trim())
    .catch(() => "");
  const diff = await execFileAsync("git", ["diff", "--find-renames", "--unified=3", "--no-color", baseRef], { cwd: workDir })
    .then((result) => result.stdout.trim())
    .catch(() => "");

  return {
    stat: stat || "(no diff stat available)",
    diff: diff.length > MAX_DIFF_CHARACTERS ? `${diff.slice(0, MAX_DIFF_CHARACTERS)}\n...[diff truncated]` : diff,
  };
}

export function buildReviewPrompt(input: ReviewAgentInput & { defaultBranch: string; diffStat: string; diff: string }): string {
  return [
    "You are Evolvo's Review agent.",
    "You are not the implementation agent.",
    "You must review the pull request critically and decide whether to approve it or reject it with reasons.",
    "Only the Review agent may move work from Ready for Review to In Review, then to Ready for Release or back to Ready for Dev.",
    "Do not propose follow-up implementation yourself. Review the evidence and return a decision.",
    "",
    `Issue #${input.issue.number}: ${input.issue.title}`,
    "",
    "Issue description:",
    input.issue.description || "(no description provided)",
    "",
    `Pull request URL: ${input.pullRequestUrl ?? "unknown"}`,
    `Default branch: ${input.defaultBranch}`,
    "",
    "Validation commands:",
    formatValidationCommands(input.validationCommands),
    "",
    "Failed validation commands:",
    formatValidationCommands(input.failedValidationCommands),
    "",
    "Implementation agent final summary:",
    input.implementationSummary || "(no implementation summary provided)",
    "",
    "Diff stat:",
    input.diffStat,
    "",
    "Diff excerpt:",
    input.diff || "(no diff available)",
    "",
    "Return strict JSON with keys decision, summary, reasons.",
    'decision must be either "approve" or "reject".',
    "summary must be a concise review conclusion.",
    "reasons must be an array of concrete review reasons.",
  ].join("\n");
}

function parseReviewResponse(finalResponse: string): ReviewAgentResult {
  const parsed = JSON.parse(finalResponse) as ReviewAgentResponse;
  const decision = parsed.decision === "approve" || parsed.decision === "reject" ? parsed.decision : null;
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const reasons = Array.isArray(parsed.reasons)
    ? parsed.reasons.filter((reason): reason is string => typeof reason === "string").map((reason) => reason.trim()).filter(Boolean)
    : [];

  if (!decision) {
    throw new Error("Review agent response did not contain a valid decision.");
  }

  if (!summary) {
    throw new Error("Review agent response did not contain a summary.");
  }

  return {
    decision,
    summary,
    reasons,
    finalResponse,
  };
}

export async function runReviewAgent(input: ReviewAgentInput): Promise<ReviewAgentResult> {
  const defaultBranch = await resolveRepositoryDefaultBranch(input.workDir).catch(() => "main");
  const diff = await readGitDiff(input.workDir, defaultBranch);
  const prompt = buildReviewPrompt({
    ...input,
    defaultBranch,
    diffStat: diff.stat,
    diff: diff.diff,
  });

  const response = await fetch(OPENAI_RESPONSES_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REVIEW_OPENAI_MODEL,
      input: [
        {
          role: "user",
          content: prompt,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "review_decision",
          schema: {
            type: "object",
            properties: {
              decision: {
                type: "string",
                enum: ["approve", "reject"],
              },
              summary: {
                type: "string",
              },
              reasons: {
                type: "array",
                items: {
                  type: "string",
                },
              },
            },
            required: ["decision", "summary", "reasons"],
            additionalProperties: false,
          },
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Review agent request failed with status ${response.status}: ${body}`);
  }

  const payload = await response.json() as {
    output_text?: unknown;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string; refusal?: string }>;
    }>;
    status?: string;
    error?: { message?: string } | null;
    incomplete_details?: { reason?: string } | null;
  };
  const finalResponse = extractResponseOutputText(payload, "Review agent");

  return parseReviewResponse(finalResponse);
}

export { parseReviewResponse };
