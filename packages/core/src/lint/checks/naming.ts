import { basename, relative } from "node:path";
import type { LintContext, LintIssue } from "../types";

export function namingCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];
	const names = new Map<string, string[]>();

	for (const file of ctx.files.contentLeafFiles) {
		const name = basename(file);
		if (!ctx.spec.leafFilenamePattern.test(name)) {
			issues.push({
				check: "naming",
				severity: "error",
				file: relative(ctx.storeDir, file),
				message: `leaf filename must be ${ctx.spec.leafFilenameDescription}`,
			});
		}
		const stem = name.replace(/\.md$/, "");
		names.set(stem, [...(names.get(stem) ?? []), file]);
	}

	for (const [stem, files] of names) {
		if (files.length < 2) continue;
		for (const file of files) {
			issues.push({
				check: "duplicate-leaf-name",
				severity: "error",
				file: relative(ctx.storeDir, file),
				message: `leaf name '${stem}' must be unique across the block`,
			});
		}
	}
	return issues;
}
