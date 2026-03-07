// CONTEXT7_API_KEY="ctx7sk-084962cb-1da6-4181-8ea8-38c760679236"
// OPENAI_API_KEY="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"
// GITHUB_TOKEN=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
// GITHUB_OWNER=evolvo-auto
// GITHUB_REPO=evolvo-ts

if (!process.env.CONTEXT7_API_KEY) {
  throw new Error("CONTEXT7_API_KEY is not set in the environment variables.");
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in the environment variables.");
}

if (!process.env.GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN is not set in the environment variables.");
}

if (!process.env.GITHUB_OWNER) {
  throw new Error("GITHUB_OWNER is not set in the environment variables.");
}

if (!process.env.GITHUB_REPO) {
  throw new Error("GITHUB_REPO is not set in the environment variables.");
}

export const CONTEXT7_API_KEY = process.env.CONTEXT7_API_KEY;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
export const GITHUB_OWNER = process.env.GITHUB_OWNER;
export const GITHUB_REPO = process.env.GITHUB_REPO;