import { frontmatterCheck } from "./checks/frontmatter";
import {
	duplicateIndexEntriesCheck,
	linkCheck,
	orphanLeavesCheck,
} from "./checks/links";
import { namingCheck } from "./checks/naming";
import { leafSizeCheck } from "./checks/size";
import { nestingCheck, structureCheck } from "./checks/structure";
import { collectFiles } from "./files";
import { getLintSpec } from "./specs";
import type { LintCheck, LintOptions, LintResult } from "./types";

const checks: LintCheck[] = [
	structureCheck,
	namingCheck,
	nestingCheck,
	linkCheck,
	orphanLeavesCheck,
	duplicateIndexEntriesCheck,
	leafSizeCheck,
	frontmatterCheck,
];

export function lint(storeDir: string, options: LintOptions = {}): LintResult {
	const spec = getLintSpec(options.spec);
	const files = collectFiles(storeDir, spec);
	if (files.allMdFiles.length === 0) return { spec: spec.id, issues: [] };

	const ctx = { storeDir, files, spec };
	return {
		spec: spec.id,
		issues: checks.flatMap((check) => check(ctx)),
	};
}

export function hasLintErrors(result: LintResult): boolean {
	return result.issues.some((issue) => issue.severity === "error");
}

export { errorCount, printLintResult, warningCount } from "./reporters/text";
export { getLintSpec, listLintSpecs } from "./specs";
export type {
	LintIssue,
	LintOptions,
	LintResult,
	LintSeverity,
	LintSpec,
} from "./types";
