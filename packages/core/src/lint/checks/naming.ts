import { basename, relative } from "node:path";
import type { LintContext, LintIssue } from "../types";

export function namingCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];
	const structural = new Set(ctx.spec.structuralFiles);

	for (const file of ctx.files.contentLeafFiles) {
		const name = basename(file);
		if (structural.has(name)) continue;
		if (!ctx.spec.leafFilenamePattern.test(name)) {
			issues.push({
				check: "naming",
				severity: "error",
				file: relative(ctx.storeDir, file),
				message: `leaf filename must be ${ctx.spec.leafFilenameDescription}`,
			});
		}
	}

	return issues;
}
