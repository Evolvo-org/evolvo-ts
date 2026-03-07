import { afterEach, describe, expect, it, vi } from "vitest";

async function importConfig() {
  vi.resetModules();
  return import("./githubConfig.js");
}

describe("getGitHubConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reads the required GitHub env values", async () => {
    vi.stubEnv("GITHUB_TOKEN", "token");
    vi.stubEnv("GITHUB_OWNER", "owner");
    vi.stubEnv("GITHUB_REPO", "repo");

    const { getGitHubConfig } = await importConfig();

    expect(getGitHubConfig()).toEqual({
      token: "token",
      owner: "owner",
      repo: "repo",
      apiBaseUrl: "https://api.github.com",
    });
  });

  it("uses GITHUB_API_BASE_URL when provided", async () => {
    vi.stubEnv("GITHUB_TOKEN", "token");
    vi.stubEnv("GITHUB_OWNER", "owner");
    vi.stubEnv("GITHUB_REPO", "repo");
    vi.stubEnv("GITHUB_API_BASE_URL", "https://github.example.com/api/v3");

    const { getGitHubConfig } = await importConfig();

    expect(getGitHubConfig().apiBaseUrl).toBe("https://github.example.com/api/v3");
  });

  it("throws when a required value is missing", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GITHUB_OWNER", "owner");
    vi.stubEnv("GITHUB_REPO", "repo");

    const { getGitHubConfig } = await importConfig();

    expect(() => getGitHubConfig()).toThrow(
      "GITHUB_TOKEN is not set in the environment variables.",
    );
  });
});
