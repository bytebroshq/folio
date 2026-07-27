import { readFileSync } from "node:fs";
import { basename, dirname, relative } from "node:path";
import { cleanLinkTarget } from "../links";
import type { LintContext, LintIssue } from "../types";
import { extractFrontmatterField } from "./frontmatter";

const INDEX_ENTRY_RE = /^-\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*—\s*(.+?)\s*$/;

function normalizeWhitespace(value: string): string {
	return value.trim().replace(/\s+/g, " ");
}

export function descriptionSyncCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];
	const entriesByIndex = new Map<string, Map<string, string>>();
	for (const index of ctx.files.indexFiles) {
		const entries = new Map<string, string>();
		for (const line of readFileSync(index, "utf-8").split("\n")) {
			const match = line.match(INDEX_ENTRY_RE);
			if (match)
				entries.set(
					cleanLinkTarget(match[1].trim()),
					normalizeWhitespace(match[2]),
				);
		}
		entriesByIndex.set(index, entries);
	}

	for (const file of ctx.files.contentLeafFiles) {
		const parent = dirname(file);
		const index =
			parent === ctx.files.leafDir
				? ctx.files.indexFiles.find(
						(candidate) => relative(ctx.storeDir, candidate) === "index.md",
					)
				: ctx.files.indexFiles.find(
						(candidate) => candidate === `${parent}/index.md`,
					);
		const name = basename(file).replace(/\.md$/, "");
		const entryDescription = index
			? entriesByIndex.get(index)?.get(name)
			: undefined;
		if (entryDescription === undefined) continue;

		const description = extractFrontmatterField(
			readFileSync(file, "utf-8"),
			"description",
		);
		if (!description) continue;
		const leafDescription = normalizeWhitespace(description);
		if (leafDescription !== entryDescription) {
			issues.push({
				check: "description-sync",
				severity: "error",
				file: relative(ctx.storeDir, file),
				message: `frontmatter description "${leafDescription}" does not match index entry description "${entryDescription}"`,
			});
		}
	}
	return issues;
}
