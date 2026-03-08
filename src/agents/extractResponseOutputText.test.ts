import { describe, expect, it } from "vitest";
import { extractResponseOutputText } from "./extractResponseOutputText.js";

describe("extractResponseOutputText", () => {
  it("returns output_text when present", () => {
    expect(
      extractResponseOutputText(
        {
          output_text: "{\"ok\":true}",
        },
        "Test agent",
      ),
    ).toBe("{\"ok\":true}");
  });

  it("falls back to output message content", () => {
    expect(
      extractResponseOutputText(
        {
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: "{\"ok\":true}",
                },
              ],
            },
          ],
        },
        "Test agent",
      ),
    ).toBe("{\"ok\":true}");
  });

  it("throws on refusal", () => {
    expect(() =>
      extractResponseOutputText(
        {
          output: [
            {
              type: "message",
              content: [
                {
                  type: "refusal",
                  refusal: "I can't do that.",
                },
              ],
            },
          ],
        },
        "Test agent",
      )).toThrow("Test agent response was refused: I can't do that.");
  });
});
