import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { applyPatchTool } from "@openai/agents";
import type { Editor } from "@openai/agents";
import { WORK_DIR } from "../constants/workDir";

const root = resolve(WORK_DIR);

function resolveWorkspacePath(filePath: string): string {
  const target = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
  const relativePath = relative(root, target);

  if (
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.startsWith("..\\")
  ) {
    throw new Error(`Operation outside workspace: ${filePath}`);
  }

  return target;
}

function relativeWorkspacePath(filePath: string): string {
  return relative(root, resolveWorkspacePath(filePath)).replaceAll("\\", "/");
}

function applyUnifiedDiff(original: string, diff: string): string {
  if (!diff) {
    return original;
  }

  const lines = diff.split(/\r?\n/);
  const body: string[] = [];

  for (const line of lines) {
    if (line === "") {
      body.push("");
      continue;
    }

    if (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++")) {
      continue;
    }

    const prefix = line[0];
    const content = line.slice(1);

    if (prefix === "+" || prefix === " ") {
      body.push(content);
      continue;
    }

    if (prefix === "-" || prefix === "\\") {
      continue;
    }

    body.push(line);
  }

  const text = body.join("\n");
  return diff.endsWith("\n") ? `${text}\n` : text;
}

export const editor: Editor = {
  createFile: async (operation) => {
    const target = resolveWorkspacePath(operation.path);
    const outputPath = relativeWorkspacePath(operation.path);
    const content = applyUnifiedDiff("", operation.diff ?? "");

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");

    return { status: "completed", output: `Created ${outputPath}` };
  },
  updateFile: async (operation) => {
    const target = resolveWorkspacePath(operation.path);
    const outputPath = relativeWorkspacePath(operation.path);
    const original = await readFile(target, "utf8");
    const patched = applyUnifiedDiff(original, operation.diff ?? "");

    await writeFile(target, patched, "utf8");

    return { status: "completed", output: `Updated ${outputPath}` };
  },
  deleteFile: async (operation) => {
    const target = resolveWorkspacePath(operation.path);
    const outputPath = relativeWorkspacePath(operation.path);

    await rm(target, { force: true });

    return { status: "completed", output: `Deleted ${outputPath}` };
  },
};

export const applyPatchAction = applyPatchTool({ editor, needsApproval: false });
