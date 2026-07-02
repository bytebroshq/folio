#!/usr/bin/env node
/**
 * Migrate a Folio store from nested `leaves/` to flat store root.
 *
 * Usage: npx tsx scripts/migrate-flat.ts <store-root> [--apply]
 * Example: npx tsx scripts/migrate-flat.ts ~/.config/folio/stores/amendments/flat-leaves
 *
 * Dry run by default. Pass --apply to actually move files.
 */

import {
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
	cpSync,
	rmSync,
	mkdirSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

// ── Config ──────────────────────────────────────────────────────────

const DRY_RUN = !process.argv.includes("--apply");
const storeRoot = process.argv[2] || process.cwd().replace(/\/$/, "");
const leavesDir = join(storeRoot, "leaves");

if (!statSync(leavesDir, { throwIfNoEntry: false })?.isDirectory()) {
	console.error(`Error: ${leavesDir} does not exist`);
	process.exit(1);
}

console.log(`Store root: ${storeRoot}`);
console.log(`Leaves dir: ${leavesDir}`);
console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}\n`);

// ── Walk all .md files under leaves/ ────────────────────────────────

function walkMd(dir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) results.push(...walkMd(full));
		else if (entry.name.endsWith(".md")) results.push(full);
	}
	return results;
}

const allFiles = walkMd(leavesDir);

// ── Compute flat name ───────────────────────────────────────────────

type RenameEntry = {
	oldRel: string; // relative to leaves/
	newName: string; // flat filename at store root
	reason?: string; // "delete" for archives/tests
};

const renames: RenameEntry[] = [];

for (const file of allFiles) {
	const rel = relative(leavesDir, file);
	const dir = dirname(rel);
	const base = basename(rel, ".md");

	// Skip structural files
	if (base === "INDEX" || base === "SCHEMA") continue;

	// Strip spaces/ prefix — it's noise
	let effectiveDir = dir;
	if (effectiveDir.startsWith("spaces/")) {
		effectiveDir = effectiveDir.slice("spaces/".length);
	}

	// Delete archives, test files, raw
	const shouldDelete =
		effectiveDir.includes("archive") ||
		effectiveDir === "_test" ||
		effectiveDir === "_hash" ||
		effectiveDir.endsWith("/raw");

	if (shouldDelete) {
		renames.push({ oldRel: rel, newName: base + ".md", reason: "delete" });
		continue;
	}

	// Compute flat name
	let name: string;
	if (effectiveDir === ".") {
		name = `${base}.md`;
	} else {
		const prefix = effectiveDir.replace(/\//g, "-");
		if (base === prefix) {
			// filename exactly matches dir — e.g. upbrew/upbrew → upbrew
			name = `${base}.md`;
		} else if (base.startsWith(`${prefix}-`)) {
			// filename already has the prefix — e.g. workspace/workspace-os → workspace-os
			name = `${base}.md`;
		} else {
			name = `${prefix}-${base}.md`;
		}
	}

	renames.push({ oldRel: rel, newName: name });
}

// Check for collisions
const nameCount = new Map<string, number[]>();
for (const r of renames) {
	if (r.reason === "delete") continue;
	const names = nameCount.get(r.newName) || [];
	names.push(r.oldRel);
	nameCount.set(r.newName, names);
}

let collisionCount = 0;
for (const [name, sources] of nameCount) {
	if (sources.length > 1) {
		console.error(`COLLISION: ${name} from ${sources.join(", ")}`);
		collisionCount++;
	}
}
if (collisionCount > 0) {
	console.error(`\n${collisionCount} collision(s) found. Aborting.`);
	process.exit(1);
}

// ── Build old_abs_path → new flat name map ──────────────────────────

// For link rewriting, resolve each [[link]] from its source file's old
// location to the target's old absolute path, then map to new flat name.

const absPathToNew = new Map<string, string>();
for (const r of renames) {
	if (r.reason === "delete") continue;
	const oldAbs = resolve(leavesDir, r.oldRel);
	const newStem = r.newName.replace(/\.md$/, "");
	absPathToNew.set(oldAbs, newStem);
}

const deletedFiles = new Set<string>();
for (const r of renames) {
	if (r.reason === "delete") {
		deletedFiles.add(resolve(leavesDir, r.oldRel));
	}
}

console.log(`File mappings: ${absPathToNew.size} entries`);
console.log(`Deleted files: ${deletedFiles.size} entries\n`);

// ── Step 1: Print plan ──────────────────────────────────────────────

const deletes = renames.filter((r) => r.reason === "delete");
const moves = renames.filter((r) => !r.reason);

console.log(`=== PLAN ===`);
console.log(`Moves: ${moves.length}`);
console.log(`Deletes: ${deletes.length}\n`);

for (const r of moves) {
	console.log(`  MOVE  ${r.oldRel} → ${r.newName}`);
}
console.log("");
for (const r of deletes) {
	console.log(`  DEL   ${r.oldRel}`);
}

// ── Step 2: Move files and rewrite links ───────────────────────────

if (!DRY_RUN) {
	const tmpDir = join(storeRoot, "_tmp_flat");
	mkdirSync(tmpDir, { recursive: true });

	// Copy files to tmp with new names
	for (const r of moves) {
		const src = join(leavesDir, r.oldRel);
		const dst = join(tmpDir, r.newName);
		cpSync(src, dst);
	}

	// Rewrite wikilinks in all moved files
	// For each wikilink, resolve it from the source file's OLD location,
	// then map to the new flat name.
	const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
	let rewriteCount = 0;
	let deadLinkCount = 0;
	const unresolvedLinks = new Map<string, string[]>();

	for (const r of moves) {
		const filePath = join(tmpDir, r.newName);
		const oldSourceAbs = resolve(leavesDir, r.oldRel);
		let content = readFileSync(filePath, "utf-8");
		const original = content;

		content = content.replace(WIKILINK_RE, (match, link, display) => {
			const clean = link.trim().replace(/#.*$/, ""); // strip fragments

			// Resolve the link from the source file's old location
			let targetAbs: string;
			if (clean.startsWith(".") || clean.startsWith("/")) {
				targetAbs = resolve(dirname(oldSourceAbs), clean);
			} else {
				// Bare name or path — resolve from source file's directory
				targetAbs = resolve(dirname(oldSourceAbs), clean);
			}
			if (!targetAbs.endsWith(".md")) targetAbs += ".md";

			const newStem = absPathToNew.get(targetAbs);
			if (newStem) {
				return display ? `[[${newStem}|${display}]]` : `[[${newStem}]]`;
			}

			if (deletedFiles.has(targetAbs)) {
				deadLinkCount++;
				return match; // leave as-is, lint will catch it
			}

			const arr = unresolvedLinks.get(r.newName) || [];
			arr.push(clean);
			unresolvedLinks.set(r.newName, arr);
			return match;
		});

		if (content !== original) {
			writeFileSync(filePath, content, "utf-8");
			rewriteCount++;
			console.log(`  rewritten: ${r.newName}`);
		}
	}

	console.log(`\nRewritten ${rewriteCount} files`);
	console.log(`Dead links (pointing to deleted files): ${deadLinkCount}`);

	if (unresolvedLinks.size > 0) {
		console.log(`\nUNRESOLVED links (will be caught by lint):`);
		for (const [file, links] of unresolvedLinks) {
			console.log(`  ${file}: ${links.join(", ")}`);
		}
	}

	// Apply: remove old leaves/, move flat files to root
	console.log(`\n=== APPLYING ===`);
	rmSync(join(storeRoot, "leaves"), { recursive: true, force: true });

	for (const r of moves) {
		const src = join(tmpDir, r.newName);
		const dst = join(storeRoot, r.newName);
		cpSync(src, dst);
	}

	// Clean up
	rmSync(tmpDir, { recursive: true, force: true });

	// Remove skills/ from store
	rmSync(join(storeRoot, "skills"), { recursive: true, force: true });

	console.log("Migration applied.");
} else {
	console.log("\n(Dry run — pass --apply to execute)");
}
