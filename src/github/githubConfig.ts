function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not set in the environment variables.`);
  }

  return value;
}

export type GitHubConfig = {
  token: string;
  owner: string;
  repo: string;
  apiBaseUrl: string;
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
};

function readOptionalPositiveInteger(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer when set.`);
  }

  return parsed;
}

function readOptionalNonNegativeInteger(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer when set.`);
  }

  return parsed;
}

export function getGitHubConfig(): GitHubConfig {
  return {
    token: requireEnv("GITHUB_TOKEN"),
    owner: requireEnv("GITHUB_OWNER"),
    repo: requireEnv("GITHUB_REPO"),
    apiBaseUrl: process.env.GITHUB_API_BASE_URL?.trim() || "https://api.github.com",
    requestTimeoutMs: readOptionalPositiveInteger("GITHUB_REQUEST_TIMEOUT_MS"),
    maxRetries: readOptionalNonNegativeInteger("GITHUB_REQUEST_MAX_RETRIES"),
    retryBaseDelayMs: readOptionalNonNegativeInteger("GITHUB_RETRY_BASE_DELAY_MS"),
  };
}
