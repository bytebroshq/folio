import { readFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import {
	cleanLinkTarget,
	extractWikilinks,
	hasRelativePathMarker,
	isPathLink,
} from "../links";
import type { LintContext, LintIssue } from "../types";

const INDEX_ENTRY_RE = /^-\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*—\s*(.+?)\s*$/;

function leafNames(ctx: LintContext): Set<string> {
	return new Set(
		ctx.files.contentLeafFiles.map((file) =>
			basename(file).replace(/\.md$/, ""),
		),
	);
}

function indexEntries(index: string): { target: string; line: number }[] {
	const entries: { target: string; line: number }[] = [];
	for (const [i, line] of readFileSync(index, "utf-8").split("\n").entries()) {
		const match = line.match(INDEX_ENTRY_RE);
		if (match)
			entries.push({ target: cleanLinkTarget(match[1].trim()), line: i + 1 });
	}
	return entries;
}

export function linkCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];
	const names = leafNames(ctx);
	const leafFiles = new Set(ctx.files.contentLeafFiles);

	for (const file of [...ctx.files.contentLeafFiles, ...ctx.files.indexFiles]) {
		const rel = relative(ctx.storeDir, file);
		const content = readFileSync(file, "utf-8");
		for (const { link, line } of extractWikilinks(content)) {
			const target = cleanLinkTarget(link);
			if (
				hasRelativePathMarker(link) ||
				isPathLink(link) ||
				link.includes("#") ||
				/\.md(?:#|$)/.test(link)
			) {
				issues.push({
					check: "path-link",
					severity: "error",
					file: rel,
					line,
					message: `[[${link}]] must use a bare leaf name`,
				});
				continue;
			}
			if (!names.has(target)) {
				issues.push({
					check: basename(file) === "index.md" ? "stale-index" : "broken-link",
					severity: "error",
					file: rel,
					line,
					message: `[[${link}]] does not resolve to a leaf`,
				});
			}
		}
		for (const [i, line] of content.split("\n").entries()) {
			for (const match of line.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
				const target = match[1].split("#")[0];
				if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
				if (leafFiles.has(resolve(dirname(file), target))) {
					issues.push({
						check: "markdown-leaf-link",
						severity: "error",
						file: rel,
						line: i + 1,
						message: `use a bare wikilink instead of Markdown link '${match[0]}' for a leaf relationship`,
					});
				}
			}
		}
	}
	return issues;
}

export function duplicateIndexEntriesCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const index of ctx.files.indexFiles) {
		const seen = new Map<string, number[]>();
		for (const { target, line } of indexEntries(index)) {
			seen.set(target, [...(seen.get(target) ?? []), line]);
		}
		for (const [target, lines] of seen) {
			if (lines.length > 1) {
				issues.push({
					check: "duplicate-index",
					severity: "error",
					file: relative(ctx.storeDir, index),
					message: `${target} at lines ${lines.join(", ")}`,
				});
			}
		}
	}
	return issues;
}

export function orphanLeavesCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];
	const entriesByIndex = new Map(
		ctx.files.indexFiles.map((index) => [
			index,
			new Set(indexEntries(index).map((entry) => entry.target)),
		]),
	);

	for (const leaf of ctx.files.contentLeafFiles) {
		const name = basename(leaf).replace(/\.md$/, "");
		const parent = dirname(leaf);
		const index =
			parent === ctx.files.leafDir
				? ctx.files.indexFiles.find(
						(file) => relative(ctx.storeDir, file) === "index.md",
					)
				: ctx.files.indexFiles.find((file) => file === `${parent}/index.md`);
		if (!index || !entriesByIndex.get(index)?.has(name)) {
			issues.push({
				check: "orphan",
				severity: "error",
				file: relative(ctx.storeDir, leaf),
				message: `not listed in structural index ${relative(ctx.storeDir, `${parent}/index.md`)}`,
			});
		}
	}
	return issues;
}
