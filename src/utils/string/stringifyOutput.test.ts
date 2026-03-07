import { describe, it, expect } from "vitest";
import { stringifyOutput } from "./stringifyOutput.js";

describe("stringifyOutput", () => {
    it("returns strings as-is", () => {
        const input = "This is a string.";
        expect(stringifyOutput(input)).toBe(input);
    });

    it("stringifies objects as JSON", () => {
        const input = { key: "value", number: 42 };
        const expected = JSON.stringify(input, null, 2);
        expect(stringifyOutput(input)).toBe(expected);
    });

    it("handles non-stringifiable objects gracefully", () => {
        const circularObj: any = {};
        circularObj.self = circularObj; // Create a circular reference
        const result = stringifyOutput(circularObj);
        expect(result).toBe("[object Object]");
    });
});
