import { execFile } from "node:child_process";
import { getGitHubConfig } from "../github/githubConfig.js";

type BranchResolutionAttempt = {
  branch: string | null;
  reason: string | null;
};

type GitHubRepositoryMetadata = {
  default_branch?: unknown;
};

function normalizeBranchName(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/^refs\/remotes\/origin\//, "")
    .replace(/^origin\//, "");
  return normalized || null;
}

async function readGitCommandOutput(workingDirectory: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd: workingDirectory }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }

      resolve(String(stdout).trim());
    });
  });
}

async function resolveDefaultBranchFromGit(workingDirectory: string): Promise<BranchResolutionAttempt> {
  const symbolicRef = normalizeBranchName(
    await readGitCommandOutput(workingDirectory, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]),
  );
  if (symbolicRef) {
    return { branch: symbolicRef, reason: null };
  }

  const remoteShow = await readGitCommandOutput(workingDirectory, ["remote", "show", "origin"]);
  const remoteHeadMatch = remoteShow?.match(/^\s*HEAD branch:\s*(.+)\s*$/m);
  const remoteHeadBranch = normalizeBranchName(remoteHeadMatch?.[1]);
  if (remoteHeadBranch) {
    return { branch: remoteHeadBranch, reason: null };
  }

  return {
    branch: null,
    reason: "origin default branch was not available from git remote metadata.",
  };
}

async function resolveDefaultBranchFromGitHub(): Promise<BranchResolutionAttempt> {
  try {
    const config = getGitHubConfig();
    const apiBaseUrl = config.apiBaseUrl.replace(/\/+$/, "");
    const response = await fetch(
      `${apiBaseUrl}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!response.ok) {
      return {
        branch: null,
        reason: `GitHub repository metadata request failed with status ${response.status}.`,
      };
    }

    const repository = await response.json() as GitHubRepositoryMetadata;
    const defaultBranch = normalizeBranchName(
      typeof repository.default_branch === "string" ? repository.default_branch : null,
    );
    if (defaultBranch) {
      return { branch: defaultBranch, reason: null };
    }

    return {
      branch: null,
      reason: "GitHub repository metadata did not include a default_branch value.",
    };
  } catch (error) {
    return {
      branch: null,
      reason: error instanceof Error ? error.message : "unknown GitHub metadata error",
    };
  }
}

export async function tryResolveRepositoryDefaultBranch(workingDirectory: string): Promise<string | null> {
  const gitAttempt = await resolveDefaultBranchFromGit(workingDirectory);
  if (gitAttempt.branch) {
    return gitAttempt.branch;
  }

  const githubAttempt = await resolveDefaultBranchFromGitHub();
  return githubAttempt.branch;
}

export async function resolveRepositoryDefaultBranch(workingDirectory: string): Promise<string> {
  const gitAttempt = await resolveDefaultBranchFromGit(workingDirectory);
  if (gitAttempt.branch) {
    return gitAttempt.branch;
  }

  const githubAttempt = await resolveDefaultBranchFromGitHub();
  if (githubAttempt.branch) {
    return githubAttempt.branch;
  }

  throw new Error(
    `Could not resolve repository default branch from git or GitHub. git: ${gitAttempt.reason ?? "unknown error"} GitHub: ${githubAttempt.reason ?? "unknown error"}`,
  );
}

export function describeRepositoryDefaultBranch(defaultBranch: string | null | undefined): string {
  const branch = normalizeBranchName(defaultBranch);
  return branch ? `\`${branch}\`` : "the repository default branch";
}

export function buildMergedPullRequestReason(defaultBranch: string | null | undefined): string {
  const branch = normalizeBranchName(defaultBranch);
  return branch ? `pull request merged into ${branch}` : "pull request merged into repository default branch";
}
