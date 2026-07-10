#!/usr/bin/env bun
/** Package the authored Folio skill without rewriting its contents. */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const CLI_ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const REPO_ROOT = join(CLI_ROOT, "..", "..");
const SKILL_SOURCE = join(REPO_ROOT, "packages", "skills", "folio");
const OUT_DIR = join(CLI_ROOT, "dist");
const OUT_FILE = join(OUT_DIR, "folio-skill.tar.gz");

mkdirSync(OUT_DIR, { recursive: true });
const result = spawnSync("tar", ["-czf", OUT_FILE, "-C", SKILL_SOURCE, "."], {
	encoding: "utf-8",
});
if (result.status !== 0)
	throw new Error(`Could not package skill: ${result.stderr || result.stdout}`);
console.log(`package-skill: wrote ${OUT_FILE}`);
