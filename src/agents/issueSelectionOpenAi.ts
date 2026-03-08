import type { UnifiedIssue } from "../issues/unifiedIssueQueue.js";
import { prioritizeIssuesForWork, type IssueSelectionDecision } from "../runtime/loopUtils.js";

const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";
const ISSUE_SELECTION_MODEL = "gpt-5.3-codex";
const ISSUE_DESCRIPTION_PREVIEW_LIMIT = 240;

type IssueSelectionResponse = {
  selectedQueueKey: string | null;
  rationale: string;
};

type IssueSelectionApiResponse = {
  status?: string;
  error?: {
    message?: string;
  } | null;
  incomplete_details?: {
    reason?: string;
  } | null;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
};

function summarizeIssueDescription(description: string): string {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "No description provided.";
  }

  if (normalized.length <= ISSUE_DESCRIPTION_PREVIEW_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, ISSUE_DESCRIPTION_PREVIEW_LIMIT - 3)}...`;
}

function buildSelectionPrompt(options: {
  issues: UnifiedIssue[];
  activeProjectSlug?: string | null;
  stoppedProjectSlug?: string | null;
}): string {
  const activeProjectSlug = options.activeProjectSlug?.trim() || null;
  const stoppedProjectSlug = options.stoppedProjectSlug?.trim() || null;

  return [
    "Choose the single best next issue for Evolvo to execute.",
    "",
    "Rules:",
    "- Return exactly one queue key from the candidate list, or null if there are no candidates.",
    "- Prefer the active project's issues when an active project is set and those issues are available.",
    "- Never select an issue for a stopped project.",
    "- Prefer in-progress work over starting unrelated new work.",
    "- Prefer bounded, high-leverage, execution-ready work.",
    "",
    `Active project slug: ${activeProjectSlug ?? "none"}`,
    `Stopped project slug: ${stoppedProjectSlug ?? "none"}`,
    "",
    "Candidates:",
    ...options.issues.map((issue) => [
      `- queueKey: ${issue.queueKey}`,
      `  source: ${issue.sourceKind}`,
      `  repository: ${issue.repository.reference}`,
      `  projectSlug: ${issue.projectSlug ?? "none"}`,
      `  issueNumber: ${issue.number}`,
      `  title: ${issue.title}`,
      `  labels: ${issue.labels.join(", ") || "none"}`,
      `  description: ${summarizeIssueDescription(issue.description)}`,
    ].join("\n")),
    "",
    "Return only JSON matching the schema.",
  ].join("\n");
}

function buildFallbackDecision(issues: UnifiedIssue[], options: {
  activeProjectSlug?: string | null;
  stoppedProjectSlug?: string | null;
}): IssueSelectionDecision & { selectedIssue: UnifiedIssue | null } {
  return prioritizeIssuesForWork(issues, options);
}

function extractFinalResponse(response: IssueSelectionApiResponse): string {
  if (response.error?.message) {
    throw new Error(`Issue selection API request failed: ${response.error.message}`);
  }
  if (response.status === "failed") {
    throw new Error("Issue selection API request failed without an error message.");
  }
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason?.trim();
    throw new Error(
      reason
        ? `Issue selection API response was incomplete: ${reason}`
        : "Issue selection API response was incomplete.",
    );
  }

  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (contentItem.type === "refusal" && typeof contentItem.refusal === "string" && contentItem.refusal.trim()) {
        throw new Error(`Issue selection response was refused: ${contentItem.refusal.trim()}`);
      }

      if (contentItem.type === "output_text" && typeof contentItem.text === "string" && contentItem.text.trim()) {
        return contentItem.text.trim();
      }
    }
  }

  throw new Error("Issue selection API response did not include assistant output text.");
}

async function createIssueSelectionResponse(options: {
  apiKey: string;
  prompt: string;
}): Promise<IssueSelectionApiResponse> {
  const response = await fetch(OPENAI_RESPONSES_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ISSUE_SELECTION_MODEL,
      instructions: [
        "You are Evolvo's issue selector.",
        "Choose exactly one issue from the supplied candidate queue.",
        "Do not inspect repositories or invent new work.",
        "Respect active/stopped project constraints.",
        "Return only JSON matching the schema.",
      ].join("\n"),
      input: [{ role: "user", content: options.prompt }],
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "issue_selection",
          strict: true,
          schema: {
            type: "object",
            properties: {
              selectedQueueKey: {
                type: ["string", "null"],
              },
              rationale: {
                type: "string",
              },
            },
            required: ["selectedQueueKey", "rationale"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Issue selection API request failed with status ${response.status}.`);
  }

  return (await response.json()) as IssueSelectionApiResponse;
}

export async function selectIssueForWorkWithOpenAi(options: {
  apiKey: string;
  issues: UnifiedIssue[];
  activeProjectSlug?: string | null;
  stoppedProjectSlug?: string | null;
}): Promise<IssueSelectionDecision & { selectedIssue: UnifiedIssue | null }> {
  if (options.issues.length <= 1) {
    return buildFallbackDecision(options.issues, options);
  }

  try {
    const prompt = buildSelectionPrompt(options);
    const response = await createIssueSelectionResponse({
      apiKey: options.apiKey,
      prompt,
    });
    const parsed = JSON.parse(extractFinalResponse(response)) as IssueSelectionResponse;
    const selectedIssue = options.issues.find((issue) => issue.queueKey === parsed.selectedQueueKey) ?? null;
    if (parsed.selectedQueueKey !== null && selectedIssue === null) {
      throw new Error(`Issue selector returned an unknown queue key: ${parsed.selectedQueueKey}`);
    }

    return {
      selectedIssue,
      candidateCount: options.issues.length,
      rationale: typeof parsed.rationale === "string" && parsed.rationale.trim().length > 0
        ? parsed.rationale.trim()
        : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`Issue selection AI failed. Falling back to host prioritization. ${message}`);
    return buildFallbackDecision(options.issues, options);
  }
}

