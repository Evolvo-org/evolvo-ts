export const DEFAULT_PROJECT_SLUG = "evolvo";
export const PROJECT_LABEL_PREFIX = "project:";

export type NormalizedProjectName = {
  displayName: string;
  slug: string;
  repositoryName: string;
  issueLabel: string;
  workspaceRelativePath: string;
};

export function buildProjectIssueLabel(slug: string): string {
  return `${PROJECT_LABEL_PREFIX}${slug}`;
}

export function normalizeProjectNameInput(input: string): NormalizedProjectName {
  const displayName = input.trim().replace(/\s+/g, " ");
  if (!displayName) {
    throw new Error("Project name is required.");
  }

  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (!slug) {
    throw new Error("Project name must contain at least one letter or number.");
  }

  if (slug === DEFAULT_PROJECT_SLUG) {
    throw new Error("The default project slug `evolvo` is reserved.");
  }

  if (slug.length > 63) {
    throw new Error("Project slug must be 63 characters or fewer after normalization.");
  }

  return {
    displayName,
    slug,
    repositoryName: slug,
    issueLabel: buildProjectIssueLabel(slug),
    workspaceRelativePath: `projects/${slug}`,
  };
}
