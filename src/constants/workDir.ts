import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

export const WORK_DIR = resolve(process.env.WORK_DIR ?? process.cwd());

mkdirSync(WORK_DIR, { recursive: true });
