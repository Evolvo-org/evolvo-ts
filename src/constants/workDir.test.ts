import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

async function importWorkDir() {
  vi.resetModules();
  return import("./workDir.js");
}

describe("WORK_DIR", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the current working directory", async () => {
    const expected = resolve(process.cwd());

    const { WORK_DIR } = await importWorkDir();

    expect(WORK_DIR).toBe(expected);
  });

  it("uses the WORK_DIR environment variable and ensures the directory exists", async () => {
    const tempDir = join(process.cwd(), ".tmp-workdir-test");
    rmSync(tempDir, { recursive: true, force: true });
    vi.stubEnv("WORK_DIR", tempDir);

    const { WORK_DIR } = await importWorkDir();

    expect(WORK_DIR).toBe(resolve(tempDir));
    expect(existsSync(tempDir)).toBe(true);

    rmSync(tempDir, { recursive: true, force: true });
  });
});
