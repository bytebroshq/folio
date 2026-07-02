import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

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
const STRUCTURAL_FILES = new Set([
	"INDEX.md",
	"SCHEMA.md",
	"AGENTS.md",
	"README.md",
]);

// ── Helpers ────────────────────────────────────────────────────────

function walkMdFiles(dir: string): string[] {
	const results: string[] = [];
	const s = statSync(dir, { throwIfNoEntry: false });
	if (!s?.isDirectory()) return results;

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === ".git" || entry.name.startsWith(".")) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...walkMdFiles(full));
		} else if (entry.name.endsWith(".md")) {
			results.push(full);
		}
	}
	return results;
}

function rootMdFiles(storeDir: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(storeDir, { withFileTypes: true })) {
		if (entry.isFile() && entry.name.endsWith(".md")) {
			results.push(join(storeDir, entry.name));
		}
	}
	return results.sort();
}

function contentLeafFiles(storeDir: string): string[] {
	return rootMdFiles(storeDir).filter(
		(file) => !STRUCTURAL_FILES.has(basename(file)),
	);
}

function extractWikilinks(content: string): { link: string; line: number }[] {
	const results: { link: string; line: number }[] = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		for (const match of lines[i].matchAll(WIKILINK_RE)) {
			results.push({ link: match[1].trim(), line: i + 1 });
		}
	}
	return results;
}

function targetPath(storeDir: string, link: string): string {
	const clean = link.replace(/#.*$/, "");
	return resolve(storeDir, clean.endsWith(".md") ? clean : `${clean}.md`);
}

function exists(p: string): boolean {
	return !!statSync(p, { throwIfNoEntry: false });
}

function fmtBytes(n: number): string {
	if (n < 1024) return `${n}B`;
	if (n < 1048576) return `${(n / 1024).toFixed(1)}KB`;
	return `${(n / 1048576).toFixed(1)}MB`;
}

function isPathLink(link: string): boolean {
	const clean = link.replace(/#.*$/, "");
	return clean.includes("/") || clean.startsWith(".") || clean.startsWith("~");
}

// ── Check: store structure ─────────────────────────────────────────

function structureIssues(storeDir: string, allFiles: string[]): LintIssue[] {
	const issues: LintIssue[] = [];

	if (!exists(join(storeDir, "INDEX.md"))) {
		issues.push({
			check: "structure",
			file: "INDEX.md",
			message: "missing required root INDEX.md",
		});
	}

	if (!exists(join(storeDir, "SCHEMA.md"))) {
		issues.push({
			check: "structure",
			file: "SCHEMA.md",
			message: "missing required root SCHEMA.md",
		});
	}

	for (const file of allFiles) {
		const rel = relative(storeDir, file);
		if (rel.includes("/")) {
			issues.push({
				check: "structure",
				file: rel,
				message:
					"nested Markdown file; Folio leaves must be flat at store root",
			});
		}
	}

	return issues;
}

// ── Check: broken wikilinks (non-INDEX files) ─────────────────────

function brokenLinks(storeDir: string, files: string[]): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const file of files) {
		if (basename(file) === "INDEX.md") continue;
		const content = readFileSync(file, "utf-8");
		for (const { link, line } of extractWikilinks(content)) {
			if (isPathLink(link)) {
				issues.push({
					check: "path-link",
					file: relative(storeDir, file),
					line,
					message: `[[${link}]] uses a path; use bare flat name`,
				});
				continue;
			}
			const target = targetPath(storeDir, link);
			if (!exists(target)) {
				issues.push({
					check: "broken-link",
					file: relative(storeDir, file),
					line,
					message: `[[${link}]] → ${relative(storeDir, target)} does not exist`,
				});
			}
		}
	}
	return issues;
}

// ── Check: stale INDEX entries ────────────────────────────────────

function staleIndexEntries(storeDir: string): LintIssue[] {
	const issues: LintIssue[] = [];
	const file = join(storeDir, "INDEX.md");
	if (!exists(file)) return issues;

	const content = readFileSync(file, "utf-8");
	for (const { link, line } of extractWikilinks(content)) {
		if (isPathLink(link)) {
			issues.push({
				check: "path-link",
				file: "INDEX.md",
				line,
				message: `[[${link}]] uses a path; use bare flat name`,
			});
			continue;
		}
		const target = targetPath(storeDir, link);
		if (!exists(target)) {
			issues.push({
				check: "stale-index",
				file: "INDEX.md",
				line,
				message: `[[${link}]] → ${relative(storeDir, target)} does not exist`,
			});
		}
	}
	return issues;
}

// ── Check: orphan leaves ───────────────────────────────────────────

function orphanLeaves(storeDir: string): LintIssue[] {
	const issues: LintIssue[] = [];
	const index = join(storeDir, "INDEX.md");
	if (!exists(index)) return issues;

	const indexed = new Set<string>();
	for (const { link } of extractWikilinks(readFileSync(index, "utf-8"))) {
		if (!isPathLink(link))
			indexed.add(link.replace(/#.*$/, "").replace(/\.md$/, ""));
	}

	for (const file of contentLeafFiles(storeDir)) {
		const relNoExt = basename(file, ".md");
		if (!indexed.has(relNoExt)) {
			issues.push({
				check: "orphan",
				file: basename(file),
				message: "not referenced in root INDEX.md",
			});
		}
	}
	return issues;
}

// ── Check: duplicate index entries ────────────────────────────────

function duplicateIndexEntries(storeDir: string): LintIssue[] {
	const issues: LintIssue[] = [];
	const file = join(storeDir, "INDEX.md");
	if (!exists(file)) return issues;

	const content = readFileSync(file, "utf-8");
	const links = extractWikilinks(content);
	const seen = new Map<string, number[]>();
	for (const { link, line } of links) {
		const norm = link.replace(/#.*$/, "").replace(/\.md$/, "").trim();
		const lines = seen.get(norm) || [];
		lines.push(line);
		seen.set(norm, lines);
	}
	for (const [target, lines] of seen) {
		if (lines.length > 1) {
			issues.push({
				check: "duplicate-index",
				file: "INDEX.md",
				message: `${target} at lines ${lines.join(", ")}`,
			});
		}
	}
	return issues;
}

// ── Check: leaf size / token budget ────────────────────────────────

function leafSizeWarnings(storeDir: string, files: string[]): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const file of files) {
		const bytes = statSync(file).size;
		const tokens = Math.round(bytes / 4);
		if (tokens > DEFAULT_TOKEN_WARN) {
			issues.push({
				check: "leaf-size",
				file: relative(storeDir, file),
				message: `${fmtBytes(bytes)}  ~${tokens.toLocaleString()} tokens (warn: ${DEFAULT_TOKEN_WARN.toLocaleString()})`,
			});
		}
	}
	return issues;
}

// ── Check: frontmatter ─────────────────────────────────────────────

function frontmatterErrors(storeDir: string, files: string[]): LintIssue[] {
	const issues: LintIssue[] = [];
	for (const file of files) {
		const content = readFileSync(file, "utf-8");
		if (!content.startsWith("---")) continue;

		const rel = relative(storeDir, file);
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
					line: i + 2,
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

export function lint(storeDir: string): LintResult {
	const allFiles = walkMdFiles(storeDir);
	const rootFiles = rootMdFiles(storeDir);
	if (allFiles.length === 0) return { issues: [] };

	return {
		issues: [
			...structureIssues(storeDir, allFiles),
			...brokenLinks(storeDir, rootFiles),
			...staleIndexEntries(storeDir),
			...orphanLeaves(storeDir),
			...duplicateIndexEntries(storeDir),
			...leafSizeWarnings(storeDir, rootFiles),
			...frontmatterErrors(storeDir, rootFiles),
		],
	};
}

// ── Output formatting ────────────────────────────────────────────

const CHECK_GROUPS: { label: string; key: string }[] = [
	{ label: "STRUCTURE", key: "structure" },
	{ label: "PATH LINKS", key: "path-link" },
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
