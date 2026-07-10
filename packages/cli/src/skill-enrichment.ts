import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONTAINS_RE = /\s*<contains>[\s\S]*?<\/contains>\s*$/;

function frontmatterRange(
	lines: string[],
): { start: number; end: number } | null {
	if (lines[0]?.trim() !== "---") return null;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === "---") return { start: 1, end: i };
	}
	return null;
}

function descriptionLine(lines: string[]): number {
	const range = frontmatterRange(lines);
	if (!range) return -1;
	for (let i = range.start; i < range.end; i++) {
		if (/^description:[ \t]*/.test(lines[i] as string)) return i;
	}
	return -1;
}

function unquote(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		try {
			return JSON.parse(value);
		} catch {
			return value.slice(1, -1);
		}
	}
	if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
	return value;
}

/** Return the optional one-line description authored in a block's INDEX.md. */
export function readIndexDescription(repoRoot: string): string | null {
	const indexPath = join(repoRoot, "INDEX.md");
	if (!existsSync(indexPath)) return null;
	const lines = readFileSync(indexPath, "utf-8").split("\n");
	const line = descriptionLine(lines);
	if (line === -1) return null;
	const value = unquote(
		(lines[line] as string).replace(/^description:[ \t]*/, "").trim(),
	).trim();
	return value || null;
}

/** Add or replace the local block-description enrichment in a skill description. */
export function enrichDescription(
	description: string,
	blockDescription: string | null,
): string {
	const stock = description.replace(CONTAINS_RE, "").trimEnd();
	return blockDescription
		? `${stock} <contains>${blockDescription}</contains>`
		: stock;
}

/** Update the installed skill's managed description enrichment in place. */
export function enrichSkillFile(skillPath: string, repoRoot: string): void {
	if (!existsSync(skillPath)) return;
	const lines = readFileSync(skillPath, "utf-8").split("\n");
	const line = descriptionLine(lines);
	if (line === -1) return;
	const description = unquote(
		(lines[line] as string).replace(/^description:[ \t]*/, "").trim(),
	);
	const next = enrichDescription(description, readIndexDescription(repoRoot));
	if (next === description) return;
	lines[line] = `description: ${JSON.stringify(next)}`;
	writeFileSync(skillPath, lines.join("\n"), "utf-8");
}
