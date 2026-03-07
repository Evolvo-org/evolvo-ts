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
      requestTimeoutMs: undefined,
      maxRetries: undefined,
      retryBaseDelayMs: undefined,
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

  it("reads optional retry and timeout env values", async () => {
    vi.stubEnv("GITHUB_TOKEN", "token");
    vi.stubEnv("GITHUB_OWNER", "owner");
    vi.stubEnv("GITHUB_REPO", "repo");
    vi.stubEnv("GITHUB_REQUEST_TIMEOUT_MS", "7000");
    vi.stubEnv("GITHUB_REQUEST_MAX_RETRIES", "0");
    vi.stubEnv("GITHUB_RETRY_BASE_DELAY_MS", "0");

    const { getGitHubConfig } = await importConfig();

    expect(getGitHubConfig()).toEqual(
      expect.objectContaining({
        requestTimeoutMs: 7000,
        maxRetries: 0,
        retryBaseDelayMs: 0,
      }),
    );
  });

  it("throws when optional retry/timeout env values are invalid", async () => {
    vi.stubEnv("GITHUB_TOKEN", "token");
    vi.stubEnv("GITHUB_OWNER", "owner");
    vi.stubEnv("GITHUB_REPO", "repo");
    vi.stubEnv("GITHUB_REQUEST_MAX_RETRIES", "-1");

    const { getGitHubConfig } = await importConfig();

    expect(() => getGitHubConfig()).toThrow(
      "GITHUB_REQUEST_MAX_RETRIES must be a non-negative integer when set.",
    );
  });
});
