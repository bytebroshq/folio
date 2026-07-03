import type { LintResult } from "../types";

const CHECK_GROUPS: { label: string; key: string }[] = [
	{ label: "STRUCTURE", key: "structure" },
	{ label: "NAMING", key: "naming" },
	{ label: "NESTING", key: "nesting" },
	{ label: "PATH LINKS", key: "path-link" },
	{ label: "BROKEN LINKS", key: "broken-link" },
	{ label: "STALE INDEX ENTRIES", key: "stale-index" },
	{ label: "ORPHAN LEAVES", key: "orphan" },
	{ label: "DUPLICATE INDEX ENTRIES", key: "duplicate-index" },
	{ label: "LEAF SIZE", key: "leaf-size" },
	{ label: "FRONTMATTER", key: "frontmatter" },
	{ label: "DESCRIPTION SYNC", key: "description-sync" },
];

export function errorCount(result: LintResult): number {
	return result.issues.filter((issue) => issue.severity === "error").length;
}

export function warningCount(result: LintResult): number {
	return result.issues.filter((issue) => issue.severity === "warn").length;
}

export function printLintResult(result: LintResult): void {
	let total = 0;

	for (const { label, key } of CHECK_GROUPS) {
		const group = result.issues.filter((issue) => issue.check === key);
		total += group.length;
		console.log(`${label} (${group.length})`);
		for (const issue of group) {
			const loc = issue.line ? `${issue.file}:${issue.line}` : issue.file;
			const prefix = issue.severity === "warn" ? "warn" : "error";
			console.log(`  ${loc}  [${prefix}] ${issue.message}`);
		}
	}

	console.log("");
	if (total === 0) {
		console.log("No issues found.");
		return;
	}

	const errors = errorCount(result);
	const warnings = warningCount(result);
	console.log(`${errors} error(s), ${warnings} warning(s) found.`);
}
