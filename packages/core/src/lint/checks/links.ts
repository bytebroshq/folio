import { readFileSync } from "node:fs";
import { basename, relative } from "node:path";
import { exists } from "../files";
import {
	cleanLinkTarget,
	extractWikilinks,
	hasRelativePathMarker,
	isPathLink,
	targetPath,
} from "../links";
import type { LintContext, LintIssue } from "../types";

export function linkCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];
	let pathLinkCount = 0;

	for (const file of ctx.files.allMdFiles) {
		const rel = relative(ctx.storeDir, file);
		const content = readFileSync(file, "utf-8");
		for (const { link, line } of extractWikilinks(content)) {
			if (hasRelativePathMarker(link)) {
				issues.push({
					check: "path-link",
					severity: "error",
					file: rel,
					line,
					message: `[[${link}]] uses a relative path marker; use a bare target or folio-root-relative path`,
				});
				continue;
			}

			if (isPathLink(link)) pathLinkCount++;

			const target = targetPath(ctx.storeDir, link);
			if (!exists(target)) {
				issues.push({
					check: basename(file) === "INDEX.md" ? "stale-index" : "broken-link",
					severity: "error",
					file: rel,
					line,
					message: `[[${link}]] → ${relative(ctx.storeDir, target)} does not exist`,
				});
			}
		}
	}

	if (pathLinkCount > ctx.spec.pathLinkWarnThreshold) {
		issues.push({
			check: "path-link",
			severity: "warn",
			file: "(folio)",
			message: `${pathLinkCount} path links found; path-heavy catalogs cost more to read, grep, and move`,
		});
	}

	return issues;
}

export function duplicateIndexEntriesCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];
	const index = ctx.files.rootMdFiles.find(
		(file) => basename(file) === "INDEX.md",
	);
	if (!index) return issues;

	const seen = new Map<string, number[]>();
	for (const { link, line } of extractWikilinks(readFileSync(index, "utf-8"))) {
		const norm = cleanLinkTarget(link);
		const lines = seen.get(norm) || [];
		lines.push(line);
		seen.set(norm, lines);
	}

	for (const [target, lines] of seen) {
		if (lines.length > 1) {
			issues.push({
				check: "duplicate-index",
				severity: "error",
				file: "INDEX.md",
				message: `${target} at lines ${lines.join(", ")}`,
			});
		}
	}

	return issues;
}

export function orphanLeavesCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];
	const index = ctx.files.rootMdFiles.find(
		(file) => basename(file) === "INDEX.md",
	);
	if (!index) return issues;

	const indexed = new Set<string>();
	for (const { link } of extractWikilinks(readFileSync(index, "utf-8"))) {
		if (!hasRelativePathMarker(link)) indexed.add(cleanLinkTarget(link));
	}

	for (const file of ctx.files.contentLeafFiles) {
		const relNoExt = relative(ctx.storeDir, file).replace(/\.md$/, "");
		if (!indexed.has(relNoExt)) {
			issues.push({
				check: "orphan",
				severity: "error",
				file: relative(ctx.storeDir, file),
				message: "not referenced in root INDEX.md",
			});
		}
	}

	return issues;
}
