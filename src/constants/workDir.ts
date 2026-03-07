import { existsSync, mkdirSync } from "fs";

export const WORK_DIR = "/home/paddy/evolvo-ts";
//  verify that the directory exists, if not create it

if (!existsSync(WORK_DIR)) {
  mkdirSync(WORK_DIR);
  console.log(`Created workspace directory: ${WORK_DIR}`);
} else {
  console.log(`Workspace directory already exists: ${WORK_DIR}`);
}