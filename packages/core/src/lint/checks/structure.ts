import { join, relative } from "node:path";
import { exists } from "../files";
import type { LintContext, LintIssue } from "../types";

export function structureCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];

	for (const requiredFile of ctx.spec.requiredRootFiles) {
		if (!exists(join(ctx.storeDir, requiredFile))) {
			issues.push({
				check: "structure",
				severity: "error",
				file: requiredFile,
				message: `missing required root ${requiredFile}`,
			});
		}
	}

	return issues;
}

export function nestingCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];

	for (const file of ctx.files.allMdFiles) {
		const rel = relative(ctx.storeDir, file);
		const depth = rel.split("/").length - 1;
		if (depth > ctx.spec.maxPreferredNestingDepth) {
			issues.push({
				check: "nesting",
				severity: "warn",
				file: rel,
				message: `deeply nested Markdown file; ${ctx.spec.label} favors flat or shallow structure`,
			});
		}
	}

	return issues;
}
