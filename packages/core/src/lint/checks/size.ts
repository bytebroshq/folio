import { statSync } from "node:fs";
import { relative } from "node:path";
import type { LintContext, LintIssue } from "../types";

function fmtBytes(n: number): string {
	if (n < 1024) return `${n}B`;
	if (n < 1048576) return `${(n / 1024).toFixed(1)}KB`;
	return `${(n / 1048576).toFixed(1)}MB`;
}

export function leafSizeCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];

	for (const file of ctx.files.contentLeafFiles) {
		const bytes = statSync(file).size;
		const tokens = Math.round(bytes / 4);
		if (tokens > ctx.spec.leafTokenWarn) {
			issues.push({
				check: "leaf-size",
				severity: "warn",
				file: relative(ctx.storeDir, file),
				message: `${fmtBytes(bytes)}  ~${tokens.toLocaleString()} tokens (warn: ${ctx.spec.leafTokenWarn.toLocaleString()})`,
			});
		}
	}

	return issues;
}
