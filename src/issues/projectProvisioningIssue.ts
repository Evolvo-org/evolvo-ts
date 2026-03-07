import type { IssueSummary } from "./taskIssueManager.js";

export type ProjectProvisioningIssueMetadata = {
  owner: string;
  displayName: string;
  slug: string;
  repositoryName: string;
  issueLabel: string;
  workspaceRelativePath: string;
  requestedBy: string;
  requestedAt: string;
};

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function buildProjectProvisioningIssueTitle(displayName: string): string {
  return `Start project ${displayName.trim()}`;
}

export function buildProjectProvisioningIssueBody(metadata: ProjectProvisioningIssueMetadata): string {
  return [
    "## Summary",
    `Provision managed project \`${metadata.displayName}\`.`,
    "",
    "<!-- evolvo:project-provisioning",
    `owner: ${metadata.owner}`,
    `display_name: ${metadata.displayName}`,
    `slug: ${metadata.slug}`,
    `repo_name: ${metadata.repositoryName}`,
    `issue_label: ${metadata.issueLabel}`,
    `workspace_relative_path: ${metadata.workspaceRelativePath}`,
    `requested_by: ${metadata.requestedBy}`,
    `requested_at: ${metadata.requestedAt}`,
    "-->",
    "",
    "## Requested Targets",
    `- Tracker label: \`${metadata.issueLabel}\``,
    `- Managed repository: \`${metadata.owner}/${metadata.repositoryName}\``,
    `- Local workspace: \`${metadata.workspaceRelativePath}\``,
    "",
    "## Execution Notes",
    "- Run provisioning on the default Evolvo workflow.",
    "- Preserve partial provisioning progress in `.evolvo/projects.json` if a later step fails.",
  ].join("\n");
}

export function parseProjectProvisioningIssueMetadata(
  description: string,
): ProjectProvisioningIssueMetadata | null {
  const match = description.match(/<!--\s*evolvo:project-provisioning([\s\S]*?)-->/i);
  if (!match?.[1]) {
    return null;
  }

  const metadata: Partial<ProjectProvisioningIssueMetadata> = {};
  const lines = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 1 || separatorIndex >= line.length - 1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!value) {
      continue;
    }

    if (key === "owner") {
      metadata.owner = value;
    }
    if (key === "display_name") {
      metadata.displayName = value;
    }
    if (key === "slug") {
      metadata.slug = value;
    }
    if (key === "repo_name") {
      metadata.repositoryName = value;
    }
    if (key === "issue_label") {
      metadata.issueLabel = value;
    }
    if (key === "workspace_relative_path") {
      metadata.workspaceRelativePath = value;
    }
    if (key === "requested_by") {
      metadata.requestedBy = value;
    }
    if (key === "requested_at") {
      metadata.requestedAt = value;
    }
  }

  const owner = normalizeNonEmptyString(metadata.owner);
  const displayName = normalizeNonEmptyString(metadata.displayName);
  const slug = normalizeNonEmptyString(metadata.slug);
  const repositoryName = normalizeNonEmptyString(metadata.repositoryName);
  const issueLabel = normalizeNonEmptyString(metadata.issueLabel);
  const workspaceRelativePath = normalizeNonEmptyString(metadata.workspaceRelativePath);
  const requestedBy = normalizeNonEmptyString(metadata.requestedBy);
  const requestedAt = normalizeNonEmptyString(metadata.requestedAt);

  if (
    !owner ||
    !displayName ||
    !slug ||
    !repositoryName ||
    !issueLabel ||
    !workspaceRelativePath ||
    !requestedBy ||
    !requestedAt
  ) {
    return null;
  }

  return {
    owner,
    displayName,
    slug,
    repositoryName,
    issueLabel,
    workspaceRelativePath,
    requestedBy,
    requestedAt,
  };
}

export function isProjectProvisioningIssue(issue: IssueSummary): boolean {
  return parseProjectProvisioningIssueMetadata(issue.description) !== null;
}
