import { readFileSync } from "node:fs";
import { relative } from "node:path";
import type { LintContext, LintIssue } from "../types";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/**
 * Extract a top-level frontmatter field's raw value as plain text. This is
 * intentionally not a YAML parser: it supports inline values plus the common
 * folded and literal block-scalar forms used for descriptions. Returns
 * undefined when the file has no frontmatter or the field is absent.
 */
export function extractFrontmatterField(
	content: string,
	field: string,
): string | undefined {
	const match = content.match(FRONTMATTER_RE);
	if (!match) return undefined;

	const lines = match[1].split(/\r?\n/);
	const fieldRe = new RegExp(`^${field}:\\s*(.*)$`);
	const fieldIndex = lines.findIndex((line) => fieldRe.test(line));
	if (fieldIndex === -1) return undefined;

	const fieldMatch = lines[fieldIndex]?.match(fieldRe);
	if (!fieldMatch) return undefined;

	let value = fieldMatch[1].trim();
	if (/^[>|][+-]?$/.test(value)) {
		const block: string[] = [];
		for (const line of lines.slice(fieldIndex + 1)) {
			if (line !== "" && !/^[ \t]/.test(line)) break;
			block.push(line.trim());
		}
		return block.join("\n").trim();
	}
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}
	return value;
}

export function frontmatterCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];

	for (const file of ctx.files.allMdFiles) {
		const content = readFileSync(file, "utf-8");
		if (!content.startsWith("---")) continue;

		const rel = relative(ctx.storeDir, file);
		const match = content.match(FRONTMATTER_RE);
		if (!match) {
			issues.push({
				check: "frontmatter",
				severity: "error",
				file: rel,
				line: 1,
				message: "opens with '---' but no closing '---' found",
			});
			continue;
		}

		const lines = match[1].split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.startsWith("\t")) {
				issues.push({
					check: "frontmatter",
					severity: "error",
					file: rel,
					line: i + 2,
					message: "tab-indented YAML (use spaces)",
				});
			} else if (
				line.trim() !== "" &&
				!line.includes(":") &&
				!line.startsWith(" ") &&
				!line.startsWith("-")
			) {
				issues.push({
					check: "frontmatter",
					severity: "error",
					file: rel,
					line: i + 2,
					message: `unexpected line: '${line.trim()}'`,
				});
			}
		}
	}

	return issues;
}
