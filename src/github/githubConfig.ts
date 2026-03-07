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
};

export function getGitHubConfig(): GitHubConfig {
  return {
    token: requireEnv("GITHUB_TOKEN"),
    owner: requireEnv("GITHUB_OWNER"),
    repo: requireEnv("GITHUB_REPO"),
    apiBaseUrl: process.env.GITHUB_API_BASE_URL?.trim() || "https://api.github.com",
  };
}
