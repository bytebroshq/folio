import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { LintFileSet, LintSpec } from "./types";

export function exists(path: string): boolean {
	return !!statSync(path, { throwIfNoEntry: false });
}

export function walkMdFiles(dir: string, spec: LintSpec): string[] {
	const results: string[] = [];
	const s = statSync(dir, { throwIfNoEntry: false });
	if (!s?.isDirectory()) return results;

	const ignoredDirs = new Set(spec.ignoredDirs);
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
		if (entry.name.startsWith(".")) continue;

		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...walkMdFiles(full, spec));
		} else if (entry.name.endsWith(".md")) {
			results.push(full);
		}
	}

	return results.sort();
}

export function rootMdFiles(storeDir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(storeDir, { withFileTypes: true })) {
		if (entry.isFile() && entry.name.endsWith(".md")) {
			results.push(join(storeDir, entry.name));
		}
	}
	return results.sort();
}

export function collectFiles(storeDir: string, spec: LintSpec): LintFileSet {
	const allMdFiles = walkMdFiles(storeDir, spec);
	const rootFiles = rootMdFiles(storeDir);
	const structural = new Set(spec.structuralFiles);
	return {
		allMdFiles,
		rootMdFiles: rootFiles,
		contentLeafFiles: allMdFiles.filter(
			(file) => !structural.has(basename(file)),
		),
	};
}
