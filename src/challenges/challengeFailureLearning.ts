import type { CodingAgentRunResult } from "../agents/runCodingAgent.js";
import type { IssueSummary, TaskIssueManager } from "../issues/taskIssueManager.js";

export const CHALLENGE_LEARNING_GENERATED_LABEL = "learning-generated";

const FAILURE_CATEGORIES = [
  "validation_failure",
  "workflow_failure",
  "execution_failure",
  "scope_control_failure",
  "unknown",
] as const;

export type ChallengeFailureCategory = (typeof FAILURE_CATEGORIES)[number];

type CorrectiveIssueTemplate = {
  title: string;
  description: string;
};

function getErrorMessage(runError: unknown): string {
  if (runError instanceof Error) {
    return runError.message.toLowerCase();
  }

  if (typeof runError === "string") {
    return runError.toLowerCase();
  }

  return "";
}

function classifyFromErrorMessage(errorMessage: string): ChallengeFailureCategory {
  if (!errorMessage) {
    return "execution_failure";
  }

  if (/(\bpr\b|pull request|branch|commit|push|merge|workflow|github api)/i.test(errorMessage)) {
    return "workflow_failure";
  }

  return "execution_failure";
}

export function classifyChallengeFailure(
  runError: unknown,
  runResult: CodingAgentRunResult | null,
): ChallengeFailureCategory {
  if (runResult?.summary.failedValidationCommands.length) {
    return "validation_failure";
  }

  if (runError !== null && runError !== undefined) {
    return classifyFromErrorMessage(getErrorMessage(runError));
  }

  if (runResult && runResult.summary.reviewOutcome === "amended") {
    if (runResult.summary.editedFiles.length === 0) {
      return "scope_control_failure";
    }

    return "unknown";
  }

  return "unknown";
}

function buildCommonChallengeReference(challengeIssueNumber: number, category: ChallengeFailureCategory): string {
  return [
    `Relates-to-Challenge: #${challengeIssueNumber}`,
    `Challenge-Failure-Category: ${category}`,
  ].join("\n");
}

function buildTemplatesForCategory(category: ChallengeFailureCategory): CorrectiveIssueTemplate[] {
  switch (category) {
    case "validation_failure":
      return [
        {
          title: "Harden challenge validation repair loop for failing checks",
          description:
            "Improve amendment/retry handling after failed validation commands, including clearer failure triage and deterministic repair steps.",
        },
        {
          title: "Add regression tests for challenge validation failure recovery",
          description:
            "Cover validation-failure challenge attempts with tests to ensure retries, diagnostics, and outcomes stay reliable.",
        },
      ];
    case "workflow_failure":
      return [
        {
          title: "Harden GitHub workflow failure recovery in challenge runs",
          description:
            "Improve resilience and diagnostics for branch/commit/push/PR/merge failures that interrupt challenge execution.",
        },
        {
          title: "Add tests for challenge workflow failure classification and handling",
          description:
            "Add focused tests that verify workflow-related errors are classified correctly and trigger bounded corrective actions.",
        },
      ];
    case "execution_failure":
      return [
        {
          title: "Improve runtime exception handling for challenge execution failures",
          description:
            "Strengthen error handling paths so runtime failures produce actionable diagnostics and predictable follow-up behavior.",
        },
      ];
    case "scope_control_failure":
      return [
        {
          title: "Tighten challenge scope control when execution yields no bounded diff",
          description:
            "Improve checks and remediation for challenge attempts that fail to produce focused, relevant repository changes.",
        },
        {
          title: "Add scope-control regression coverage for challenge attempt outcomes",
          description:
            "Add tests for boundedness checks and off-task handling so challenge retries remain focused and reviewable.",
        },
      ];
    default:
      return [
        {
          title: "Improve challenge failure diagnostics for unclassified outcomes",
          description:
            "Add structured logging and tighter failure evidence capture to reduce unknown challenge failure classifications.",
        },
      ];
  }
}

function withChallengeContext(
  templates: CorrectiveIssueTemplate[],
  challengeIssueNumber: number,
  category: ChallengeFailureCategory,
): CorrectiveIssueTemplate[] {
  const challengeReference = buildCommonChallengeReference(challengeIssueNumber, category);

  return templates.slice(0, 3).map((template) => ({
    title: template.title,
    description: `${template.description}\n\n${challengeReference}`,
  }));
}

export async function createCorrectiveIssuesForChallengeFailure(
  issueManager: TaskIssueManager,
  challengeIssueNumber: number,
  category: ChallengeFailureCategory,
): Promise<IssueSummary[]> {
  const created: IssueSummary[] = [];
  const templates = withChallengeContext(buildTemplatesForCategory(category), challengeIssueNumber, category);

  for (const template of templates) {
    const result = await issueManager.createIssue(template.title, template.description);
    if (result.ok && result.issue) {
      created.push(result.issue);
    }
  }

  return created;
}

export function buildChallengeFailureLearningComment(options: {
  challengeIssueNumber: number;
  category: ChallengeFailureCategory;
  correctiveIssues: IssueSummary[];
}): string {
  const lines = [
    "## Challenge Failure Learning",
    `- Challenge issue: #${options.challengeIssueNumber}`,
    `- Failure classification: \`${options.category}\``,
  ];

  if (options.correctiveIssues.length === 0) {
    lines.push("- Corrective issues generated: none");
    return lines.join("\n");
  }

  lines.push(`- Corrective issues generated: ${options.correctiveIssues.length}`);
  for (const issue of options.correctiveIssues) {
    lines.push(`- #${issue.number} ${issue.title}`);
  }

  return lines.join("\n");
}
