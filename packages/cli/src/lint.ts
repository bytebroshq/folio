import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

// ── Types ──────────────────────────────────────────────────────────

export interface LintIssue {
	check: string;
	file: string;
	line?: number;
	message: string;
}

export interface LintResult {
	issues: LintIssue[];
}

// ── Constants ───────────────────────────────────────────────────────

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
const DEFAULT_TOKEN_WARN = 10_000; // ~40 KB of English text

// ── Helpers ────────────────────────────────────────────────────────

function walkMdFiles(dir: string): string[] {
	const results: string[] = [];
	const s = statSync(dir, { throwIfNoEntry: false });
	if (!s?.isDirectory()) return results;

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...walkMdFiles(full));
		} else if (entry.name.endsWith(".md")) {
			results.push(full);
		}
	}
	return results;
}

function extractWikilinks(content: string): { link: string; line: number }[] {
	const results: { link: string; line: number }[] = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		WIKILINK_RE.lastIndex = 0;
		for (const match of lines[i].matchAll(WIKILINK_RE)) {
			results.push({ link: match[1].trim(), line: i + 1 });
		}
	}
	return results;
}

function resolveLinkTarget(
	leavesDir: string,
	sourceFile: string,
	link: string,
): string {
	const clean = link.replace(/#.*$/, ""); // strip fragments
	let target: string;
	if (clean.startsWith(".") || clean.startsWith("/")) {
		target = resolve(dirname(sourceFile), clean);
	} else {
		target = resolve(leavesDir, clean);
	}
	if (!target.endsWith(".md")) target += ".md";
	return target;
}

function exists(p: string): boolean {
	return !!statSync(p, { throwIfNoEntry: false });
}

function fmtBytes(n: number): string {
	if (n < 1024) return `${n}B`;
	if (n < 1048576) return `${(n / 1024).toFixed(1)}KB`;
	return `${(n / 1048576).toFixed(1)}MB`;
}

// ── Check: broken wikilinks (non-INDEX files) ─────────────────────

function brokenLinks(leavesDir: string, files: string[]): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const file of files) {
		if (basename(file) === "INDEX.md") continue;
		const content = readFileSync(file, "utf-8");
		for (const { link, line } of extractWikilinks(content)) {
			const target = resolveLinkTarget(leavesDir, file, link);
			if (!exists(target)) {
				issues.push({
					check: "broken-link",
					file: relative(leavesDir, file),
					line,
					message: `[[${link}]] → ${relative(leavesDir, target)} does not exist`,
				});
			}
		}
	}
	return issues;
}

// ── Check: stale INDEX entries ────────────────────────────────────

function staleIndexEntries(leavesDir: string, files: string[]): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const file of files) {
		if (basename(file) !== "INDEX.md") continue;
		const content = readFileSync(file, "utf-8");
		const rel = relative(leavesDir, file);
		for (const { link, line } of extractWikilinks(content)) {
			const target = resolveLinkTarget(leavesDir, file, link);
			if (!exists(target)) {
				issues.push({
					check: "stale-index",
					file: rel,
					line,
					message: `[[${link}]] → ${relative(leavesDir, target)} does not exist`,
				});
			}
		}
	}
	return issues;
}

// ── Check: orphan leaves ───────────────────────────────────────────

function orphanLeaves(leavesDir: string, files: string[]): LintIssue[] {
	const issues: LintIssue[] = [];

	// Collect normalized link targets from all INDEX files
	const indexed = new Set<string>();
	for (const file of files) {
		if (basename(file) !== "INDEX.md") continue;
		const content = readFileSync(file, "utf-8");
		for (const { link } of extractWikilinks(content)) {
			const target = resolveLinkTarget(leavesDir, file, link);
			indexed.add(relative(leavesDir, target).replace(/\.md$/, ""));
		}
	}

	// Every non-structural .md must appear in at least one INDEX
	for (const file of files) {
		const name = basename(file);
		if (name === "INDEX.md" || name === "SCHEMA.md") continue;
		const relNoExt = relative(leavesDir, file).replace(/\.md$/, "");
		if (!indexed.has(relNoExt)) {
			issues.push({
				check: "orphan",
				file: relative(leavesDir, file),
				message: "not referenced in any INDEX.md",
			});
		}
	}
	return issues;
}

// ── Check: duplicate index entries ────────────────────────────────

function duplicateIndexEntries(
	leavesDir: string,
	files: string[],
): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const file of files) {
		if (basename(file) !== "INDEX.md") continue;
		const content = readFileSync(file, "utf-8");
		const links = extractWikilinks(content);
		const seen = new Map<string, number[]>();
		for (const { link, line } of links) {
			const norm = link.replace(/\.md$/, "").trim();
			const lines = seen.get(norm) || [];
			lines.push(line);
			seen.set(norm, lines);
		}
		for (const [target, lines] of seen) {
			if (lines.length > 1) {
				issues.push({
					check: "duplicate-index",
					file: relative(leavesDir, file),
					message: `${target}  at lines ${lines.join(", ")}`,
				});
			}
		}
	}
	return issues;
}

// ── Check: leaf size / token budget ────────────────────────────────

function leafSizeWarnings(leavesDir: string, files: string[]): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const file of files) {
		const bytes = statSync(file).size;
		const tokens = Math.round(bytes / 4);
		if (tokens > DEFAULT_TOKEN_WARN) {
			issues.push({
				check: "leaf-size",
				file: relative(leavesDir, file),
				message: `${fmtBytes(bytes)}  ~${tokens.toLocaleString()} tokens (warn: ${DEFAULT_TOKEN_WARN.toLocaleString()})`,
			});
		}
	}
	return issues;
}

// ── Check: frontmatter ─────────────────────────────────────────────

function frontmatterErrors(leavesDir: string, files: string[]): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const file of files) {
		const content = readFileSync(file, "utf-8");
		if (!content.startsWith("---")) continue;

		const rel = relative(leavesDir, file);
		const m = content.match(FRONTMATTER_RE);
		if (!m) {
			issues.push({
				check: "frontmatter",
				file: rel,
				line: 1,
				message: "opens with '---' but no closing '---' found",
			});
			continue;
		}

		const fm = m[1];
		const lines = fm.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.startsWith("\t")) {
				issues.push({
					check: "frontmatter",
					file: rel,
					line: i + 2, // +2 for opening ---
					message: "tab-indented YAML (use spaces)",
				});
			} else if (
				line.trim() !== "" &&
				!line.includes(":") &&
				!line.startsWith(" ") &&
				!line.startsWith("-")
			) {
				issues.push({
					check: "frontmatter",
					file: rel,
					line: i + 2,
					message: `unexpected line: '${line.trim()}'`,
				});
			}
		}
	}
	return issues;
}

// ── Main ────────────────────────────────────────────────────────────

export function lint(leavesDir: string): LintResult {
	const files = walkMdFiles(leavesDir);
	if (files.length === 0) return { issues: [] };

	return {
		issues: [
			...brokenLinks(leavesDir, files),
			...staleIndexEntries(leavesDir, files),
			...orphanLeaves(leavesDir, files),
			...duplicateIndexEntries(leavesDir, files),
			...leafSizeWarnings(leavesDir, files),
			...frontmatterErrors(leavesDir, files),
		],
	};
}

// ── Output formatting ────────────────────────────────────────────

const CHECK_GROUPS: { label: string; key: string }[] = [
	{ label: "BROKEN LINKS", key: "broken-link" },
	{ label: "STALE INDEX ENTRIES", key: "stale-index" },
	{ label: "ORPHAN LEAVES", key: "orphan" },
	{ label: "DUPLICATE INDEX ENTRIES", key: "duplicate-index" },
	{ label: "LEAF SIZE", key: "leaf-size" },
	{ label: "FRONTMATTER", key: "frontmatter" },
];

export function printLintResult(result: LintResult): void {
	let total = 0;

	for (const { label, key } of CHECK_GROUPS) {
		const group = result.issues.filter((i) => i.check === key);
		total += group.length;
		console.log(`${label} (${group.length})`);
		for (const issue of group) {
			const loc = issue.line ? `${issue.file}:${issue.line}` : issue.file;
			console.log(`  ${loc}  ${issue.message}`);
		}
	}

	console.log("");
	if (total === 0) {
		console.log("No issues found.");
	} else {
		console.log(`${total} issue(s) found.`);
	}
}
