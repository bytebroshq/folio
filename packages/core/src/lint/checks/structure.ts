import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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

	if (!exists(ctx.files.leafDir)) {
		issues.push({
			check: "structure",
			severity: "error",
			file: "leaves/",
			message: "missing required leaves/ directory",
		});
		return issues;
	}

	const requiredIndexes = new Set<string>();
	for (const leaf of ctx.files.contentLeafFiles) {
		let dir = dirname(leaf);
		while (dir !== ctx.files.leafDir && dir.startsWith(ctx.files.leafDir)) {
			requiredIndexes.add(join(dir, "index.md"));
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	}

	for (const index of requiredIndexes) {
		if (!exists(index)) {
			issues.push({
				check: "structure",
				severity: "error",
				file: relative(ctx.storeDir, index),
				message:
					"missing required nested index for a directory containing leaves",
			});
		}
	}

	const rootIndex = join(ctx.storeDir, "index.md");
	const leavesIndex = join(ctx.files.leafDir, "index.md");
	if (exists(leavesIndex)) {
		issues.push({
			check: "structure",
			severity: "warn",
			file: relative(ctx.storeDir, leavesIndex),
			message:
				"leaves/index.md is redundant; use the root index as the leaves/ map",
		});
	}
	const knownIndexes = new Set(ctx.files.indexFiles);
	const reachable = new Set<string>(exists(rootIndex) ? [rootIndex] : []);
	const pending = [...reachable];
	while (pending.length > 0) {
		const index = pending.pop() as string;
		const parent = index === rootIndex ? ctx.files.leafDir : dirname(index);
		const content = exists(index) ? readFileSync(index, "utf-8") : "";
		const groupTargets = new Set<string>();
		for (const line of content.split("\n")) {
			const match = line.match(/^-\s*\[[^\]]+\]\(([^)]+\/index\.md)\)/);
			if (!match) continue;
			const target = resolve(dirname(index), match[1]);
			if (groupTargets.has(target)) {
				issues.push({
					check: "duplicate-index",
					severity: "error",
					file: relative(ctx.storeDir, index),
					message: `duplicate group entry for ${relative(ctx.storeDir, target)}`,
				});
				continue;
			}
			groupTargets.add(target);
			if (!knownIndexes.has(target)) {
				issues.push({
					check: "stale-index",
					severity: "error",
					file: relative(ctx.storeDir, index),
					message: `group index ${relative(ctx.storeDir, target)} does not exist`,
				});
				continue;
			}
			if (dirname(target) !== parent && dirname(dirname(target)) !== parent) {
				issues.push({
					check: "group-index",
					severity: "error",
					file: relative(ctx.storeDir, index),
					message: `group index ${relative(ctx.storeDir, target)} must be an immediate child index`,
				});
			}
			if (!reachable.has(target)) {
				reachable.add(target);
				pending.push(target);
			}
		}
	}
	for (const index of ctx.files.indexFiles) {
		if (index !== rootIndex && index !== leavesIndex && !reachable.has(index)) {
			issues.push({
				check: "group-index",
				severity: "error",
				file: relative(ctx.storeDir, index),
				message:
					"nested index is not reachable from root index through group entries",
			});
		}
	}

	return issues;
}

export function nestingCheck(ctx: LintContext): LintIssue[] {
	const issues: LintIssue[] = [];

	for (const file of ctx.files.contentLeafFiles) {
		const rel = relative(ctx.files.leafDir, file);
		const depth = rel.split("/").length - 1;
		if (depth > ctx.spec.maxPreferredNestingDepth) {
			issues.push({
				check: "nesting",
				severity: "warn",
				file: relative(ctx.storeDir, file),
				message: `deeply nested leaf; ${ctx.spec.label} favors flat or shallow structure`,
			});
		}
	}

	return issues;
}
