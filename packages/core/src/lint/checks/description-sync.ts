import { readFileSync } from "node:fs";
import { basename, relative } from "node:path";
import { cleanLinkTarget } from "../links";
import type { LintContext, LintIssue } from "../types";
import { extractFrontmatterField } from "./frontmatter";

// An index entry (SPEC.md §7): a list line with a single bracket link
// followed by a literal em dash (—) and description text. ASCII hyphens are
// not entry delimiters. The description group is optional so an entry with no
// description text still matches (and is treated as an empty description below).
const INDEX_ENTRY_RE = /^-\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*(?:—\s*(.*))?$/;

function normalizeWhitespace(value: string): string {
	return value.trim().replace(/\s+/g, " ");
}

/**
 * Description sync (SPEC.md §4.1, §7, §11): for every leaf that has a
 * `description` frontmatter field AND has an index entry, the entry's
 * description text must exactly equal the leaf's description after
 * whitespace normalization. Leaves without a `description` field are not
 * checked — adoption is convention-driven (SCHEMA.md), not linter-enforced.
 */
export function descriptionSyncCheck(ctx: LintContext): LintIssue[] {
	if (ctx.spec.id !== "folio") return [];

	const issues: LintIssue[] = [];
	const index = ctx.files.rootMdFiles.find(
		(file) => basename(file) === "INDEX.md",
	);
	if (!index) return issues;

	const entryDescriptions = new Map<string, string>();
	for (const line of readFileSync(index, "utf-8").split("\n")) {
		const match = line.match(INDEX_ENTRY_RE);
		if (!match) continue;
		const target = cleanLinkTarget(match[1].trim());
		entryDescriptions.set(target, normalizeWhitespace(match[2] ?? ""));
	}

	for (const file of ctx.files.contentLeafFiles) {
		const relNoExt = relative(ctx.storeDir, file).replace(/\.md$/, "");
		const entryDescription = entryDescriptions.get(relNoExt);
		if (entryDescription === undefined) continue;

		const leafDescription = extractFrontmatterField(
			readFileSync(file, "utf-8"),
			"description",
		);
		if (leafDescription === undefined) continue;

		const leafNorm = normalizeWhitespace(leafDescription);
		if (leafNorm !== entryDescription) {
			issues.push({
				check: "description-sync",
				severity: "error",
				file: relative(ctx.storeDir, file),
				message: `frontmatter description "${leafNorm}" does not match INDEX.md entry description "${entryDescription}"`,
			});
		}
	}

	return issues;
}
