import { describe, expect, it } from "vitest";
import {
  MANAGED_PROJECT_WORKSPACE_ROOT,
  buildProjectIssueLabel,
  normalizeProjectNameInput,
} from "./projectNaming.js";

describe("projectNaming", () => {
  it("normalizes a project name into display, slug, label, and workspace paths", () => {
    expect(normalizeProjectNameInput("  Habit   CLI!  ")).toEqual({
      displayName: "Habit CLI!",
      slug: "habit-cli",
      repositoryName: "habit-cli",
      issueLabel: "project:habit-cli",
      workspacePath: `${MANAGED_PROJECT_WORKSPACE_ROOT}/habit-cli`,
    });
  });

  it("builds reserved project labels", () => {
    expect(buildProjectIssueLabel("habit-cli")).toBe("project:habit-cli");
  });

  it("supports overriding the managed workspace root", () => {
    expect(normalizeProjectNameInput("Habit CLI", { workspaceRoot: "/tmp/workspaces" }).workspacePath).toBe(
      "/tmp/workspaces/habit-cli",
    );
  });

  it("rejects whitespace-only project names", () => {
    expect(() => normalizeProjectNameInput("   ")).toThrow("Project name is required.");
  });

  it("rejects names that normalize to no letters or numbers", () => {
    expect(() => normalizeProjectNameInput("!!!")).toThrow(
      "Project name must contain at least one letter or number.",
    );
  });

  it("rejects the reserved default project slug", () => {
    expect(() => normalizeProjectNameInput("Evolvo")).toThrow(
      "The default project slug `evolvo` is reserved.",
    );
  });
});
