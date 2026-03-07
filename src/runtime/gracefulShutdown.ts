import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

const EVOLVO_DIRECTORY_NAME = ".evolvo";
const GRACEFUL_SHUTDOWN_REQUEST_FILE_NAME = "graceful-shutdown-request.json";
const DISCORD_CONTROL_CURSOR_FILE_NAME = "discord-control-cursor.json";
const GRACEFUL_SHUTDOWN_REQUEST_VERSION = 1;

export type GracefulShutdownRequest = {
  version: typeof GRACEFUL_SHUTDOWN_REQUEST_VERSION;
  source: "discord";
  command: "/quit";
  messageId: string;
  requestedAt: string;
};

type DiscordControlCursorState = {
  lastSeenMessageId: string | null;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeMessageId(value: unknown): string | null {
  if (!isNonEmptyString(value)) {
    return null;
  }

  return value.trim();
}

function normalizeGracefulShutdownRequest(raw: unknown): GracefulShutdownRequest | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const candidate = raw as Partial<GracefulShutdownRequest>;
  const messageId = normalizeMessageId(candidate.messageId);
  if (candidate.source !== "discord" || candidate.command !== "/quit" || messageId === null) {
    return null;
  }

  const requestedAt = isNonEmptyString(candidate.requestedAt) ? candidate.requestedAt.trim() : null;
  if (requestedAt === null) {
    return null;
  }

  return {
    version: GRACEFUL_SHUTDOWN_REQUEST_VERSION,
    source: "discord",
    command: "/quit",
    messageId,
    requestedAt,
  };
}

function normalizeDiscordControlCursorState(raw: unknown): DiscordControlCursorState {
  if (typeof raw !== "object" || raw === null) {
    return { lastSeenMessageId: null };
  }

  const candidate = raw as Partial<DiscordControlCursorState>;
  return {
    lastSeenMessageId: normalizeMessageId(candidate.lastSeenMessageId),
  };
}

async function readJsonFile(path: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function getGracefulShutdownRequestPath(workDir: string): string {
  return join(workDir, EVOLVO_DIRECTORY_NAME, GRACEFUL_SHUTDOWN_REQUEST_FILE_NAME);
}

export function getDiscordControlCursorPath(workDir: string): string {
  return join(workDir, EVOLVO_DIRECTORY_NAME, DISCORD_CONTROL_CURSOR_FILE_NAME);
}

export async function readGracefulShutdownRequest(workDir: string): Promise<GracefulShutdownRequest | null> {
  const raw = await readJsonFile(getGracefulShutdownRequestPath(workDir));
  return normalizeGracefulShutdownRequest(raw);
}

export async function recordGracefulShutdownRequest(
  workDir: string,
  input: {
    messageId: string;
    requestedAt?: string;
  },
): Promise<{ request: GracefulShutdownRequest; created: boolean }> {
  const existing = await readGracefulShutdownRequest(workDir);
  if (existing !== null) {
    return { request: existing, created: false };
  }

  const messageId = normalizeMessageId(input.messageId);
  if (messageId === null) {
    throw new Error("Graceful shutdown request message ID cannot be empty.");
  }

  const requestedAt = isNonEmptyString(input.requestedAt)
    ? input.requestedAt.trim()
    : new Date().toISOString();

  const request: GracefulShutdownRequest = {
    version: GRACEFUL_SHUTDOWN_REQUEST_VERSION,
    source: "discord",
    command: "/quit",
    messageId,
    requestedAt,
  };
  await writeJsonFile(getGracefulShutdownRequestPath(workDir), request);
  return { request, created: true };
}

export async function consumeGracefulShutdownRequest(workDir: string): Promise<GracefulShutdownRequest | null> {
  const request = await readGracefulShutdownRequest(workDir);
  if (request === null) {
    return null;
  }

  await fs.rm(getGracefulShutdownRequestPath(workDir), { force: true });
  return request;
}

export async function readDiscordControlCursor(workDir: string): Promise<string | null> {
  const raw = await readJsonFile(getDiscordControlCursorPath(workDir));
  return normalizeDiscordControlCursorState(raw).lastSeenMessageId;
}

export async function writeDiscordControlCursor(workDir: string, lastSeenMessageId: string | null): Promise<void> {
  await writeJsonFile(getDiscordControlCursorPath(workDir), {
    lastSeenMessageId: normalizeMessageId(lastSeenMessageId),
  } satisfies DiscordControlCursorState);
}
