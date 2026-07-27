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
		if (entry.isDirectory()) results.push(...walkMdFiles(full, spec));
		else if (entry.name.endsWith(".md")) results.push(full);
	}

	return results.sort();
}

export function rootMdFiles(storeDir: string): string[] {
	const s = statSync(storeDir, { throwIfNoEntry: false });
	if (!s?.isDirectory()) return [];
	return readdirSync(storeDir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => join(storeDir, entry.name))
		.sort();
}

export function collectFiles(storeDir: string, spec: LintSpec): LintFileSet {
	const leafDir = join(storeDir, "leaves");
	const allMdFiles = walkMdFiles(storeDir, spec);
	const leafMdFiles = walkMdFiles(leafDir, spec);
	const indexFiles = [
		join(storeDir, "index.md"),
		...leafMdFiles.filter((file) => basename(file) === "index.md"),
	].filter(exists);

	return {
		allMdFiles,
		rootMdFiles: rootMdFiles(storeDir),
		leafDir,
		indexFiles,
		contentLeafFiles: leafMdFiles.filter(
			(file) => basename(file) !== "index.md",
		),
	};
}
