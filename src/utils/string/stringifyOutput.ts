export function stringifyOutput(output: unknown): string {
    if (typeof output === "string") {
        return output;
    }

    try {
        return JSON.stringify(output, null, 2);
    } catch {
        return String(output);
    }
}
