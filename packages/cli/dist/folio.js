#!/usr/bin/env node
// package.json
var package_default = {
  name: "@folio/cli",
  version: "0.3.1",
  private: true,
  type: "module",
  bin: {
    folio: "dist/folio.js"
  },
  main: "src/index.ts",
  types: "src/index.d.ts",
  scripts: {
    build: "bun run scripts/embed-skill.ts && bun build --target=node src/index.ts --outfile=dist/folio.js"
  },
  dependencies: {
    "@folio/core": "workspace:*"
  },
  devDependencies: {
    "@types/node": "^26.1.0"
  }
};

// src/commands.ts
import {
  existsSync as existsSync4,
  mkdirSync as mkdirSync2,
  readdirSync as readdirSync2,
  statSync as statSync3,
  writeFileSync as writeFileSync3
} from "node:fs";
import { dirname, join as join4 } from "node:path";

// ../core/src/lint/checks/description-sync.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { basename, relative as relative2 } from "node:path";

// ../core/src/lint/links.ts
import { resolve } from "node:path";
var WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
function extractWikilinks(content) {
  const results = [];
  const lines = content.split(`
`);
  for (let i = 0;i < lines.length; i++) {
    for (const match of lines[i].matchAll(WIKILINK_RE)) {
      results.push({ link: match[1].trim(), line: i + 1 });
    }
  }
  return results;
}
function cleanLinkTarget(link) {
  return link.replace(/#.*$/, "").replace(/\.md$/, "").trim();
}
function hasRelativePathMarker(link) {
  const clean = cleanLinkTarget(link);
  return clean === "." || clean === ".." || clean.startsWith("./") || clean.startsWith("../");
}
function isPathLink(link) {
  const clean = cleanLinkTarget(link);
  return clean.includes("/");
}
function targetPath(storeDir, link) {
  const clean = cleanLinkTarget(link);
  return resolve(storeDir, `${clean}.md`);
}

// ../core/src/lint/checks/frontmatter.ts
import { readFileSync } from "node:fs";
import { relative } from "node:path";
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
function extractFrontmatterField(content, field) {
  const match = content.match(FRONTMATTER_RE);
  if (!match)
    return;
  const fieldRe = new RegExp(`^${field}:\\s*(.*)$`, "m");
  const fieldMatch = match[1].match(fieldRe);
  if (!fieldMatch)
    return;
  let value = fieldMatch[1].trim();
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  }
  return value;
}
function frontmatterCheck(ctx) {
  const issues = [];
  for (const file of ctx.files.allMdFiles) {
    const content = readFileSync(file, "utf-8");
    if (!content.startsWith("---"))
      continue;
    const rel = relative(ctx.storeDir, file);
    const match = content.match(FRONTMATTER_RE);
    if (!match) {
      issues.push({
        check: "frontmatter",
        severity: "error",
        file: rel,
        line: 1,
        message: "opens with '---' but no closing '---' found"
      });
      continue;
    }
    const lines = match[1].split(`
`);
    for (let i = 0;i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("\t")) {
        issues.push({
          check: "frontmatter",
          severity: "error",
          file: rel,
          line: i + 2,
          message: "tab-indented YAML (use spaces)"
        });
      } else if (line.trim() !== "" && !line.includes(":") && !line.startsWith(" ") && !line.startsWith("-")) {
        issues.push({
          check: "frontmatter",
          severity: "error",
          file: rel,
          line: i + 2,
          message: `unexpected line: '${line.trim()}'`
        });
      }
    }
  }
  return issues;
}

// ../core/src/lint/checks/description-sync.ts
var INDEX_ENTRY_RE = /^-\s*\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s*(?:—\s*(.*))?$/;
function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}
function descriptionSyncCheck(ctx) {
  if (ctx.spec.id !== "folio")
    return [];
  const issues = [];
  const index = ctx.files.rootMdFiles.find((file) => basename(file) === "INDEX.md");
  if (!index)
    return issues;
  const entryDescriptions = new Map;
  for (const line of readFileSync2(index, "utf-8").split(`
`)) {
    const match = line.match(INDEX_ENTRY_RE);
    if (!match)
      continue;
    const target = cleanLinkTarget(match[1].trim());
    entryDescriptions.set(target, normalizeWhitespace(match[2] ?? ""));
  }
  for (const file of ctx.files.contentLeafFiles) {
    const relNoExt = relative2(ctx.storeDir, file).replace(/\.md$/, "");
    const entryDescription = entryDescriptions.get(relNoExt);
    if (entryDescription === undefined)
      continue;
    const leafDescription = extractFrontmatterField(readFileSync2(file, "utf-8"), "description");
    if (leafDescription === undefined)
      continue;
    const leafNorm = normalizeWhitespace(leafDescription);
    if (leafNorm !== entryDescription) {
      issues.push({
        check: "description-sync",
        severity: "error",
        file: relative2(ctx.storeDir, file),
        message: `frontmatter description "${leafNorm}" does not match INDEX.md entry description "${entryDescription}"`
      });
    }
  }
  return issues;
}

// ../core/src/lint/checks/links.ts
import { readFileSync as readFileSync3 } from "node:fs";
import { basename as basename3, relative as relative3 } from "node:path";

// ../core/src/lint/files.ts
import { readdirSync, statSync } from "node:fs";
import { basename as basename2, join } from "node:path";
function exists(path) {
  return !!statSync(path, { throwIfNoEntry: false });
}
function walkMdFiles(dir, spec) {
  const results = [];
  const s = statSync(dir, { throwIfNoEntry: false });
  if (!s?.isDirectory())
    return results;
  const ignoredDirs = new Set(spec.ignoredDirs);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name))
      continue;
    if (entry.name.startsWith("."))
      continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMdFiles(full, spec));
    } else if (entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results.sort();
}
function rootMdFiles(storeDir) {
  const results = [];
  for (const entry of readdirSync(storeDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(join(storeDir, entry.name));
    }
  }
  return results.sort();
}
function collectFiles(storeDir, spec) {
  const allMdFiles = walkMdFiles(storeDir, spec);
  const rootFiles = rootMdFiles(storeDir);
  const structural = new Set(spec.structuralFiles);
  return {
    allMdFiles,
    rootMdFiles: rootFiles,
    contentLeafFiles: allMdFiles.filter((file) => !structural.has(basename2(file)))
  };
}

// ../core/src/lint/checks/links.ts
function linkCheck(ctx) {
  const issues = [];
  let pathLinkCount = 0;
  for (const file of ctx.files.allMdFiles) {
    const rel = relative3(ctx.storeDir, file);
    const content = readFileSync3(file, "utf-8");
    for (const { link, line } of extractWikilinks(content)) {
      if (hasRelativePathMarker(link)) {
        issues.push({
          check: "path-link",
          severity: "error",
          file: rel,
          line,
          message: `[[${link}]] uses a relative path marker; use a bare target or folio-root-relative path`
        });
        continue;
      }
      if (isPathLink(link))
        pathLinkCount++;
      const target = targetPath(ctx.storeDir, link);
      if (!exists(target)) {
        issues.push({
          check: basename3(file) === "INDEX.md" ? "stale-index" : "broken-link",
          severity: "error",
          file: rel,
          line,
          message: `[[${link}]] → ${relative3(ctx.storeDir, target)} does not exist`
        });
      }
    }
  }
  if (pathLinkCount > ctx.spec.pathLinkWarnThreshold) {
    issues.push({
      check: "path-link",
      severity: "warn",
      file: "(folio)",
      message: `${pathLinkCount} path links found; path-heavy catalogs cost more to read, grep, and move`
    });
  }
  return issues;
}
function duplicateIndexEntriesCheck(ctx) {
  const issues = [];
  const index = ctx.files.rootMdFiles.find((file) => basename3(file) === "INDEX.md");
  if (!index)
    return issues;
  const seen = new Map;
  for (const { link, line } of extractWikilinks(readFileSync3(index, "utf-8"))) {
    const norm = cleanLinkTarget(link);
    const lines = seen.get(norm) || [];
    lines.push(line);
    seen.set(norm, lines);
  }
  for (const [target, lines] of seen) {
    if (lines.length > 1) {
      issues.push({
        check: "duplicate-index",
        severity: "error",
        file: "INDEX.md",
        message: `${target} at lines ${lines.join(", ")}`
      });
    }
  }
  return issues;
}
function orphanLeavesCheck(ctx) {
  const issues = [];
  const index = ctx.files.rootMdFiles.find((file) => basename3(file) === "INDEX.md");
  if (!index)
    return issues;
  const indexed = new Set;
  for (const { link } of extractWikilinks(readFileSync3(index, "utf-8"))) {
    if (!hasRelativePathMarker(link))
      indexed.add(cleanLinkTarget(link));
  }
  for (const file of ctx.files.contentLeafFiles) {
    const relNoExt = relative3(ctx.storeDir, file).replace(/\.md$/, "");
    if (!indexed.has(relNoExt)) {
      issues.push({
        check: "orphan",
        severity: "error",
        file: relative3(ctx.storeDir, file),
        message: "not referenced in root INDEX.md"
      });
    }
  }
  return issues;
}

// ../core/src/lint/checks/naming.ts
import { basename as basename4, relative as relative4 } from "node:path";
function namingCheck(ctx) {
  const issues = [];
  const structural = new Set(ctx.spec.structuralFiles);
  for (const file of ctx.files.contentLeafFiles) {
    const name = basename4(file);
    if (structural.has(name))
      continue;
    if (!ctx.spec.leafFilenamePattern.test(name)) {
      issues.push({
        check: "naming",
        severity: "error",
        file: relative4(ctx.storeDir, file),
        message: `leaf filename must be ${ctx.spec.leafFilenameDescription}`
      });
    }
  }
  return issues;
}

// ../core/src/lint/checks/size.ts
import { statSync as statSync2 } from "node:fs";
import { relative as relative5 } from "node:path";
function fmtBytes(n) {
  if (n < 1024)
    return `${n}B`;
  if (n < 1048576)
    return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1048576).toFixed(1)}MB`;
}
function leafSizeCheck(ctx) {
  const issues = [];
  for (const file of ctx.files.contentLeafFiles) {
    const bytes = statSync2(file).size;
    const tokens = Math.round(bytes / 4);
    if (tokens > ctx.spec.leafTokenWarn) {
      issues.push({
        check: "leaf-size",
        severity: "warn",
        file: relative5(ctx.storeDir, file),
        message: `${fmtBytes(bytes)}  ~${tokens.toLocaleString()} tokens (warn: ${ctx.spec.leafTokenWarn.toLocaleString()})`
      });
    }
  }
  return issues;
}

// ../core/src/lint/checks/structure.ts
import { join as join2, relative as relative6 } from "node:path";
function structureCheck(ctx) {
  const issues = [];
  for (const requiredFile of ctx.spec.requiredRootFiles) {
    if (!exists(join2(ctx.storeDir, requiredFile))) {
      issues.push({
        check: "structure",
        severity: "error",
        file: requiredFile,
        message: `missing required root ${requiredFile}`
      });
    }
  }
  return issues;
}
function nestingCheck(ctx) {
  const issues = [];
  for (const file of ctx.files.allMdFiles) {
    const rel = relative6(ctx.storeDir, file);
    const depth = rel.split("/").length - 1;
    if (depth > ctx.spec.maxPreferredNestingDepth) {
      issues.push({
        check: "nesting",
        severity: "warn",
        file: rel,
        message: `deeply nested Markdown file; ${ctx.spec.label} favors flat or shallow structure`
      });
    }
  }
  return issues;
}

// ../core/src/lint/specs.ts
var folioSpec = {
  id: "folio",
  label: "Folio Knowledge Format",
  requiredRootFiles: ["INDEX.md", "SCHEMA.md"],
  structuralFiles: [
    "INDEX.md",
    "SCHEMA.md",
    "AGENTS.md",
    "README.md",
    "SPEC.md"
  ],
  ignoredDirs: [".git", "node_modules", "dist", "build", ".wrangler"],
  leafFilenamePattern: /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
  leafFilenameDescription: "kebab-case filename, e.g. folio-roadmap.md",
  maxPreferredNestingDepth: 1,
  pathLinkWarnThreshold: 10,
  leafTokenWarn: 1e4
};
var specs = new Map([[folioSpec.id, folioSpec]]);
function getLintSpec(id = "folio") {
  const spec = specs.get(id);
  if (!spec) {
    throw new Error(`Unknown lint spec '${id}'. Available specs: ${listLintSpecs().join(", ")}`);
  }
  return spec;
}
function listLintSpecs() {
  return [...specs.keys()].sort();
}

// ../core/src/lint/reporters/text.ts
var CHECK_GROUPS = [
  { label: "STRUCTURE", key: "structure" },
  { label: "NAMING", key: "naming" },
  { label: "NESTING", key: "nesting" },
  { label: "PATH LINKS", key: "path-link" },
  { label: "BROKEN LINKS", key: "broken-link" },
  { label: "STALE INDEX ENTRIES", key: "stale-index" },
  { label: "ORPHAN LEAVES", key: "orphan" },
  { label: "DUPLICATE INDEX ENTRIES", key: "duplicate-index" },
  { label: "LEAF SIZE", key: "leaf-size" },
  { label: "FRONTMATTER", key: "frontmatter" },
  { label: "DESCRIPTION SYNC", key: "description-sync" }
];
function errorCount(result) {
  return result.issues.filter((issue) => issue.severity === "error").length;
}
function warningCount(result) {
  return result.issues.filter((issue) => issue.severity === "warn").length;
}
function printLintResult(result) {
  let total = 0;
  for (const { label, key } of CHECK_GROUPS) {
    const group = result.issues.filter((issue) => issue.check === key);
    total += group.length;
    console.log(`${label} (${group.length})`);
    for (const issue of group) {
      const loc = issue.line ? `${issue.file}:${issue.line}` : issue.file;
      const prefix = issue.severity === "warn" ? "warn" : "error";
      console.log(`  ${loc}  [${prefix}] ${issue.message}`);
    }
  }
  console.log("");
  if (total === 0) {
    console.log("No issues found.");
    return;
  }
  const errors = errorCount(result);
  const warnings = warningCount(result);
  console.log(`${errors} error(s), ${warnings} warning(s) found.`);
}

// ../core/src/lint/index.ts
var checks = [
  structureCheck,
  namingCheck,
  nestingCheck,
  linkCheck,
  orphanLeavesCheck,
  duplicateIndexEntriesCheck,
  leafSizeCheck,
  frontmatterCheck,
  descriptionSyncCheck
];
function lint(storeDir, options = {}) {
  const spec = getLintSpec(options.spec);
  const files = collectFiles(storeDir, spec);
  if (files.allMdFiles.length === 0)
    return { spec: spec.id, issues: [] };
  const ctx = { storeDir, files, spec };
  return {
    spec: spec.id,
    issues: checks.flatMap((check) => check(ctx))
  };
}
function hasLintErrors(result) {
  return result.issues.some((issue) => issue.severity === "error");
}
// src/config.ts
import { existsSync, mkdirSync, readFileSync as readFileSync4, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve as resolve2 } from "node:path";
var FOLIO_HOME = process.env.FOLIO_HOME || `${homedir()}/.config/folio`;
var STORE_DIR = `${FOLIO_HOME}/stores`;
var AMEND_DIR = `${STORE_DIR}/amendments`;
var CONFIG_FILE = `${FOLIO_HOME}/config.yml`;
var BASE_REPO = `${STORE_DIR}/.main`;
function readConfig(key) {
  if (!existsSync(CONFIG_FILE))
    return null;
  const raw = readFileSync4(CONFIG_FILE, "utf-8");
  if (!key)
    return raw;
  const match = raw.match(new RegExp(`^${key}:[^\\S\\n]*(.*)$`, "m"));
  const val = match ? match[1].trim() : null;
  return val && val !== "" ? val : null;
}
function writeConfig(key, value) {
  const file = existsSync(CONFIG_FILE) ? readFileSync4(CONFIG_FILE, "utf-8") : `remote: 
store: git
`;
  const regex = new RegExp(`^${key}:.*$`, "m");
  const line = `${key}: ${value}`;
  const updated = regex.test(file) ? file.replace(regex, line) : `${file.trimEnd()}
${line}
`;
  writeFileSync(CONFIG_FILE, updated, "utf-8");
}
function ensureConfig() {
  mkdirSync(FOLIO_HOME, { recursive: true });
  mkdirSync(STORE_DIR, { recursive: true });
  mkdirSync(AMEND_DIR, { recursive: true });
  if (!existsSync(CONFIG_FILE)) {
    writeConfig("remote", "");
    writeConfig("store", "git");
  }
  const legacySource = readConfig("source");
  if (legacySource && !readConfig("path")) {
    writeConfig("path", legacySource);
    writeConfig("source", "");
  }
}
function topicToSlug(topic) {
  return topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-/, "").replace(/-$/, "");
}
function amendmentPath(topic) {
  return `${AMEND_DIR}/${topicToSlug(topic)}`;
}
function getRemote() {
  const remote = readConfig("remote");
  if (!remote)
    throw new Error("no remote configured — run 'folio bind <ns/repo>'");
  return remote;
}
function getPath() {
  return readConfig("path") ?? readConfig("source");
}
function baseRepo() {
  return getPath() ?? BASE_REPO;
}
function hasRemote() {
  return !!readConfig("remote");
}
function getStrategy() {
  const explicit = readConfig("strategy");
  if (explicit === "merge" || explicit === "pr")
    return explicit;
  return hasRemote() ? "pr" : "merge";
}
function resolvePath(p) {
  const expanded = p === "~" || p.startsWith("~/") ? `${homedir()}${p.slice(1)}` : p;
  return resolve2(expanded);
}

// src/git.ts
import { execSync } from "node:child_process";
import { existsSync as existsSync2 } from "node:fs";
function run(cmd, opts) {
  try {
    const result = execSync(cmd, {
      encoding: "utf-8",
      cwd: opts?.cwd,
      stdio: opts?.quiet ? "pipe" : "pipe",
      maxBuffer: 1024 * 1024
    });
    return {
      stdout: (result || "").trim(),
      stderr: "",
      exitCode: 0
    };
  } catch (err) {
    const e = err;
    return {
      stdout: (e.stdout || "").toString().trim(),
      stderr: (e.stderr || "").toString().trim(),
      exitCode: e.status ?? 1
    };
  }
}
function gh(args, remote) {
  const repo = remote ?? getRemote();
  return run(`gh ${args} --repo "${repo}"`, { quiet: true });
}
function mainRef() {
  return getStrategy() === "merge" ? "main" : "origin/main";
}
function ensureBase(remote) {
  const path = getPath();
  if (path) {
    if (!existsSync2(`${path}/.git`)) {
      const repo2 = remote ?? readConfig("remote");
      if (!repo2) {
        throw new Error(`Bound local folio missing at ${path}. Re-run 'folio bind <path>'.`);
      }
      console.log(`Recreating checkout of ${repo2} at ${path}...`);
      const r2 = run(`git clone --quiet git@github.com:${repo2}.git "${path}"`);
      if (r2.exitCode !== 0) {
        throw new Error(`Failed to clone ${repo2} into ${path}. Check access and try again.`);
      }
    }
    run(`git -C "${path}" config extensions.worktreeConfig true`, {
      quiet: true
    });
    return;
  }
  const repo = remote ?? getRemote();
  if (existsSync2(`${BASE_REPO}/.git`)) {
    return;
  }
  console.log("Initializing shared clone...");
  const r = run(`git clone --quiet git@github.com:${repo}.git "${BASE_REPO}"`);
  if (r.exitCode !== 0) {
    throw new Error(`Failed to clone ${repo}. Check access and try again.`);
  }
  run(`git -C "${BASE_REPO}" config extensions.worktreeConfig true`, {
    quiet: true
  });
}
function mainExists() {
  return existsSync2(`${baseRepo()}/.git`);
}
function fetchMain() {
  if (!hasRemote())
    return;
  run(`git -C "${baseRepo()}" fetch origin main --quiet`, { quiet: true });
}
function behindCount() {
  if (!hasRemote())
    return 0;
  const result = run(`git -C "${baseRepo()}" rev-list --count HEAD..origin/main 2>/dev/null || echo 0`, { quiet: true });
  return Number.parseInt(result.stdout || "0", 10);
}
function parseGitHubOrigin(repoPath) {
  const url = run(`git -C "${repoPath}" remote get-url origin 2>/dev/null`, {
    quiet: true
  }).stdout;
  const match = url.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
  return match ? match[1] : null;
}
function isMergedToMain(branch) {
  fetchMain();
  const merge = getStrategy() === "merge";
  const flag = merge ? "" : "-r ";
  const needle = merge ? branch : `origin/${branch}`;
  return run(`git -C "${baseRepo()}" branch ${flag}--merged ${mainRef()} 2>/dev/null | grep -q "${needle}" && echo yes || echo no`, { quiet: true }).stdout === "yes";
}
function amendmentBranch(path) {
  return run(`git -C "${path}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""`, {
    quiet: true
  }).stdout || "?";
}
function isDirty(path) {
  const diff = run(`git -C "${path}" diff --quiet 2>/dev/null || echo dirty`, {
    quiet: true
  }).stdout;
  const cached = run(`git -C "${path}" diff --cached --quiet 2>/dev/null || echo dirty`, { quiet: true }).stdout;
  const untracked = run(`git -C "${path}" ls-files --others --exclude-standard 2>/dev/null`, { quiet: true }).stdout;
  return diff !== "" || cached !== "" || untracked !== "";
}
function worktreeExists(path) {
  return existsSync2(`${path}/.git`);
}
function listOpenPRMap(remote) {
  const map = new Map;
  const result = gh(`pr list --state open --json number,headRefName,isDraft --jq '.[] | .headRefName + "@" + (.number|tostring) + "@" + (.isDraft|tostring)'`, remote);
  if (!result.stdout)
    return map;
  for (const line of result.stdout.split(`
`)) {
    const draftSep = line.lastIndexOf("@");
    if (draftSep === -1)
      continue;
    const isDraftStr = line.slice(draftSep + 1);
    const head = line.slice(0, draftSep);
    const numSep = head.lastIndexOf("@");
    if (numSep === -1)
      continue;
    const branch = head.slice(0, numSep);
    const num = head.slice(numSep + 1);
    if (branch && num) {
      map.set(branch, { number: num, isDraft: isDraftStr === "true" });
    }
  }
  return map;
}
function listAmendments() {
  const results = [];
  const { exitCode } = run(`ls "${AMEND_DIR}" 2>/dev/null`, { quiet: true });
  if (exitCode !== 0)
    return results;
  const { stdout } = run(`ls -1 "${AMEND_DIR}" 2>/dev/null`, { quiet: true });
  if (!stdout)
    return results;
  const remote = readConfig("remote");
  const topics = [];
  const topicBranches = new Map;
  for (const topic of stdout.split(`
`)) {
    if (!topic)
      continue;
    const path = `${AMEND_DIR}/${topic}`;
    if (!existsSync2(path))
      continue;
    const branch = amendmentBranch(path);
    if (branch && branch !== "?")
      topicBranches.set(topic, branch);
    topics.push(topic);
  }
  const prMap = remote ? listOpenPRMap(remote) : new Map;
  for (const topic of topics) {
    const path = `${AMEND_DIR}/${topic}`;
    const dirty = isDirty(path);
    const status = dirty ? "dirty" : "clean";
    let pr;
    let prNumber;
    let prDraft;
    const branch = topicBranches.get(topic);
    if (branch) {
      const info = prMap.get(branch);
      if (info) {
        pr = `PR #${info.number}`;
        prNumber = info.number;
        prDraft = info.isDraft;
      }
    }
    results.push({ topic, status, pr, prNumber, prDraft });
  }
  return results;
}
function ensureGh() {
  const r = run("which gh 2>/dev/null", { quiet: true });
  if (r.exitCode !== 0) {
    throw new Error("gh CLI not found. Install from https://cli.github.com");
  }
}

// src/open.ts
function openBrowser(url) {
  try {
    run(`open "${url}" 2>/dev/null || xdg-open "${url}" 2>/dev/null || echo "open ${url}"`, { quiet: true });
  } catch {
    console.log(url);
  }
}

// src/skill-bundle.gen.ts
var skillBundle = {
  "SKILL.md": `---
name: folio
description: Use when reading, querying, writing, or maintaining Folio knowledgebase pages — concise Markdown context, decisions, rationale, constraints, cross-repo context, filing a decision, or getting oriented in a Folio repo. The folio CLI, when installed, is the fast path — chainable verbs from draft to publish; manual git works too.
metadata:
  folio-cli-version: 0.3.1
---

# Folio skill

## What folio is

Folio is a Markdown knowledge format: linked leaves with a few strict conventions, favoring plain files, stable names, and concise prose so both humans and machines can read, link, search, and validate with less noise. The name is the bookbinding term — a folio is a sheet folded into leaves of a book, which is why a page is a *leaf* and a collection is a *block*.

- **Leaf** — a single Markdown page.
- **Block** — a collection of leaves, including an INDEX.md map and a SCHEMA.md.
- **Index** — the \`INDEX.md\` at the root of a block.
- **Schema** — the \`SCHEMA.md\`; principles and conventions observed throughout a block.

## Directives

- Folio knowledge is ground truth unless the user disagrees.
- Leaves MUST be FKF spec compliant; use \`folio lint\` when available.
- Always keep knowledge current; check with \`folio status\` regularly.
- Use the block's enclosed SCHEMA as the guideline for writing.
- Avoid programmatically traversing outside the block's path.
- Don't assume topic from filenames.
- When frontmatter \`description\` is present, keep it exactly in sync with the
  leaf's \`INDEX.md\` entry text.

## Workflow

### Evaluation

Start here to establish a strategy moving forward.

1. Check for CLI installation.
   - **Installed** — compare \`folio --version\` to the \`folio-cli-version\` stamp in this skill's frontmatter. On mismatch, defer to \`folio --help\` for current verbs; if available, \`folio skill install\` refreshes these files from the CLI's embedded copy.
   - **Not installed** — the manual workflow is the default path. The CLI is optional and unlocks the CLI workflow:
     \`\`\`bash
     curl -fsSL https://raw.githubusercontent.com/bytebroshq/folio/main/packages/cli/install.sh | bash
     \`\`\`
2. Ground in the bound block: read its \`INDEX.md\` — the topic map — as soon
   as this skill fires, not only once a leaf search begins. This skill's own
   \`description\` may carry a "Bound folio: ..." scent stamped from that
   INDEX's frontmatter; the live file, not the stamp, is ground truth for
   what the block actually covers.

### Knowledge Search & Retrieval

1. Read \`INDEX.md\` to build a map of the block.
2. Read \`SCHEMA.md\` to acquaint with its standards.
3. Use the most efficient available tools to traverse links and read the relevant leaves.
4. Check for pending folio drafts touching your topic; treat them as pending, not truth.

### Write

When the CLI is installed, prefer it. Verbs take the topic explicitly and
chain with \`&&\`, so the normal agent path is \`draft -> edit -> proof\`.
\`proof\` commits pending draft edits or adopts a remote-only draft, runs
lint, rebases onto the default branch, then opens or updates the draft PR
for review. Keep \`publish\` separate, and run it only after explicit human
approval.

1.1 **CLI Driven** → \`references/workflow-cli.md\`
1.2 **Manual Approach** → \`references/workflow-manual.md\`

Both paths follow the same ritual — open a folio draft on a topic, edit, validate, publish after human review — and both carry one shared role boundary: **flipping a draft PR to ready is a human act.** The CLI never does it, and an agent must not do it via \`gh\`.

## References

- \`references/workflow-cli.md\` — draft ritual via the CLI
- \`references/workflow-manual.md\` — draft ritual via plain git
- \`references/writing.md\` — writing contract: placement, leaf shape, index discipline
- \`references/linting.md\` — conformance rules and how to check them
- \`references/reorg.md\` — consolidating, merging, or retiring leaves
`,
  "references/linting.md": `# Folio linting guide

Lint rules are conformance rules from SPEC.md §11 — properties of the files
themselves, mechanical and deterministic. The CLI checks them fast; every one
of them can also be verified by hand. Lint MUST NOT use semantic ranking,
RAG, or LLM inference to decide validity.

## The rules

- root \`INDEX.md\` exists
- root \`SCHEMA.md\` exists
- filenames are kebab-case
- bracket links resolve to existing \`.md\` files
- no relative path markers in bracket links (\`./\`, \`../\`)
- no stale index entries (index links to deleted/renamed leaves)
- no orphan leaves (every leaf MUST appear in \`INDEX.md\`)
- no duplicate index entries
- description sync: when a leaf has a \`description\` frontmatter field and an
  index entry (\`- [[leaf]] — description\`), the entry text must exactly
  match the leaf's description after whitespace normalization
- frontmatter is well-formed YAML, when present
- leaves are not oversized

Flat or shallow structure is preferred, but nesting is not a format failure —
a linter may warn about deep nesting or path-heavy catalogs as usability
issues. Strict lint fails on errors, not warnings.

## With the CLI

\`\`\`bash
folio lint --strict        # fail on errors
folio lint --json          # machine-readable output
folio lint --spec folio    # select the Folio Knowledge Format profile explicitly
folio lint --spec okf      # lint an OKF bundle by its own rules instead
\`\`\`

\`folio proof\` runs lint automatically before staging a folio draft for review.

## By hand

From the folio root:

\`\`\`bash
ls INDEX.md SCHEMA.md                              # reserved files exist
ls *.md | grep -E '[A-Z_ ]'                        # kebab-case violations (ignore reserved files)
grep -rno '\\[\\[[^]]*\\]\\]' --include='*.md' .       # list all wikilinks…
grep -rn '\\[\\[\\.\\.\\?/' --include='*.md' .          # …relative path markers
\`\`\`

Then check, leaf by leaf against the link list:

- every \`[[target]]\` has a matching \`target.md\` (folio-root-relative)
- every entry in \`INDEX.md\` points at an existing leaf, exactly once
- every leaf appears in \`INDEX.md\`
- for each leaf with a \`description\` field and an index entry, the entry's
  description text matches the frontmatter \`description\` exactly
  (whitespace-normalized)
- frontmatter blocks parse as YAML
- no leaf has grown past a comfortable read (split or reorg if so)
`,
  "references/reorg.md": `# Folio reorg guide

Playbook for consolidating or restructuring leaves (merging pages, retiring
stale ones, renaming).

## When to reorg

Signals a topic's leaves have drifted:

- multiple leaves cover overlapping ground (design notes vs shipped truth)
- leaves frame superseded artifacts as current (old prototypes, dead repos)
- INDEX.md descriptions no longer match what the leaves actually say
- readers (or agents) keep pulling stale context from the wrong leaf

## Principles

- **One draft.** A reorg is a single coherent change; do it as one
  folio draft / one draft PR, not a trickle of per-file edits.
- **Current truth only.** Leaves describe what is true now. Design-session
  history, migration narratives, and "two homes during transition" framing
  belong in git/PR records, not in the leaf body.
- **Merge down, don't fork.** Fold design/redesign scratch leaves into the
  canonical leaf once shipped, then delete the scratch leaf.
- **Retired means retired.** If an old artifact must be mentioned, name it
  once as retired/superseded — never present it alongside the current one as
  a parallel option.

## Procedure

1. Map the topic: list every leaf touching it via \`INDEX.md\` and grep.
2. Decide the target set of leaves (fewer, each with one clear job).
3. Open one folio draft for the whole reorg: \`folio draft <topic-reorg>\`, or
   manually \`git switch -c amend/<topic-reorg>\` (see
   \`references/workflow-manual.md\`).
4. Rewrite/merge/delete leaves. For each surviving leaf, sweep for stale
   framing: old repo names, "prototype", "transition", migration arrows
   (\`old → new\`), dual-home language.
5. Update \`INDEX.md\`: remove deleted leaves, reframe descriptions of changed
   ones.
6. Fix all inbound wikilinks to deleted/renamed leaves.
7. Validate the draft: \`folio proof <topic-reorg>\`, or commit manually and run
   the manual lint checklist (\`references/linting.md\`). Lint must be clean —
   broken links, stale index entries, and orphans are the common reorg
   failures.
8. The draft PR stays draft; a human marks it ready. Never run \`gh pr ready\`.

## Stale-framing sweep

After the structural work, grep the touched leaves for leftovers:

\`\`\`bash
grep -rn -e 'prototype' -e 'transition' -e '→' -e '<old-repo-name>' <leaves>
\`\`\`

Every hit should either be deleted or rewritten as a one-line "retired,
superseded by X" note. Repeat until clean — stale framing tends to survive
in tables and asides even after the prose is fixed.
`,
  "references/workflow-cli.md": `# Folio draft workflow — CLI

When the \`folio\` CLI is installed, the ritual is:

\`\`\`bash
folio draft cubby-org-model                                  # opens a draft worktree on amend/cubby-org-model
# edit leaves in the worktree; keep the delta small and topical
folio proof cubby-org-model
# a human reviews and marks the PR ready on GitHub
folio publish cubby-org-model                                 # squash-merges after human approval; cleans up the branch
\`\`\`

Every draft verb — \`proof\`, \`publish\`, \`drop\`, \`lint\` — takes its topic
explicitly. This is what makes concurrent drafts safe: nothing is shared
between processes, so one agent's draft can never be hijacked by another's.
Chain steps with \`&&\`, naming the topic once per command; verbs stay
single-purpose (\`proof\` commits any pending edits in the worktree it's
already given before it lints, but there's no combined "commit and publish"
verb — publish still requires its own explicit run).

## Verb ownership

- \`draft\` opens or resumes an isolated amendment worktree for one topic.
- \`proof\` owns review prep: commit pending edits, or adopt a remote-only
  draft when the local worktree is missing, then lint, rebase, and push with
  \`--force-with-lease\`; for \`strategy: pr\` it opens or updates a draft PR, and
  for \`strategy: merge\` it shows the rebased diff.
- \`publish\` owns landing only: check currency, attempt the merge, translate
  failures, and clean up after success. It does not commit dirty edits, mark a
  PR ready, batch drafts, or publish all topics.
- \`lint\` is standalone inspection or preflight. It is useful before work starts,
  but \`proof\` runs lint again over the committed, rebased draft.
- \`drop\` deletes the draft branch and worktree. Treat it as destructive; use it
  only when explicitly requested.

## FOLIO_DRAFT

A script or hook that wraps the whole ritual in one process can set
\`FOLIO_DRAFT\` once instead of repeating the topic every call:

\`\`\`bash
export FOLIO_DRAFT=cubby-org-model
folio proof
\`\`\`

Resolution order: explicit argument, then \`$FOLIO_DRAFT\`, then an error
that names the fix. Interactive agents should keep passing the topic
explicitly — env doesn't survive between tool calls, and the topic in the
command self-documents the transcript.

## Strategy

\`folio config\` reports the binding as three keys: \`remote\` (owner/repo, if GitHub-backed), \`path\` (where the checkout lives), and \`strategy\` — which names what \`publish\` does.

- **\`strategy: pr\`** — \`proof\` pushes the \`amend/\` branch and opens or updates a draft PR. \`publish\` squash-merges into the default branch.
- **\`strategy: merge\`** — no PR. \`proof\` lints, rebases onto the default branch, and shows the diff. \`publish\` squash-merges when the human says so.

## Multiplayer semantics

Drafts are independent worktrees; multiple agents can draft and proof
concurrently without interfering. \`proof\` rebases onto the default
branch each time, so publish order across drafts doesn't matter — when one
draft lands, the others simply re-proof against the new default branch. A
rebase conflict touching the same leaf surfaces to exactly one agent, with
the worktree path to resolve it in.

## Rules

- The merged default branch is published truth. Never push to it directly.
- Folio drafts are pending knowledge; surface them as pending, don't adopt them silently as truth.
- One coherent change per draft; keep deltas small and topical.
- **Flipping a draft PR to ready is a human act.** The CLI never does it, and an agent must not do it via \`gh\`.
- Squash-merge on publish, preserving the PR title/body with \`(#N)\` in the subject.

## Abandon

\`\`\`bash
folio drop cubby-org-model --force   # deletes the amend/ branch and worktree
\`\`\`

## After merge

\`\`\`bash
folio status            # fleet dashboard: every open draft, plus the default branch's state
\`\`\`
`,
  "references/workflow-manual.md": `# Folio draft workflow — manual

When the \`folio\` CLI is not installed, the ritual uses plain git and the GitHub CLI (or the web). The CLI ritual (\`workflow-cli.md\`) follows the same shape verb-for-verb if the CLI is available later.

## Manual ritual

\`\`\`bash
git switch -c amend/<topic> <default-branch>
# edit leaves; keep the delta small and topical
# hand-lint against references/linting.md
git add -A && git commit -m "short message"
git push -u origin amend/<topic>
gh pr create --draft --title "..." --body "..."   # or open the PR on the web
\`\`\`

A human reviews and marks the PR ready on GitHub. After the squash merge:

\`\`\`bash
git switch <default-branch> && git pull --ff-only
git branch -d amend/<topic>
\`\`\`

No GitHub remote? Same discipline locally: branch, edit, lint, then merge into the default branch only on explicit human approval.

## Rules

- The merged default branch is published truth. Never push to it directly.
- Folio drafts are pending knowledge; surface them as pending, don't adopt them silently as truth.
- One coherent change per draft; keep deltas small and topical.
- **Flipping a draft PR to ready is a human act.** Never run \`gh pr ready\`; let the human do it on GitHub.
- Squash-merge on publish, preserving the PR title/body with \`(#N)\` in the subject.

## After merge

Run the lint checklist in \`references/linting.md\` against the merged result if anything seems off.
`,
  "references/writing.md": `# Folio writing guide

## Placement

Folio favors flat or shallow structure. Prefer filenames, frontmatter, \`INDEX.md\`,
and links over directories.

Use deterministic namespace prefixes for collision prevention, e.g.:

- project pages: \`project-*.md\`
- people pages: \`people-*.md\`
- reusable patterns: \`patterns-*.md\`

Check \`SCHEMA.md\` for the folio's own prefix vocabulary before inventing one.

One level of nesting is acceptable when a catalog grows. Deeper nesting should be
a last resort because paths cost tokens, reduce grep-ability, and add link churn.

## Leaf shape

Frontmatter is optional. Use it when filtering, grouping, or tooling needs it,
preferring the spec's shared field names:

\`\`\`yaml
---
title: Human Title
description: One-sentence summary for previews and index generation.
type: decision
tags: [topic, kind]
date: 2026-07-03
---
\`\`\`

\`type\` values are folio-local — define the vocabulary in \`SCHEMA.md\`.

\`description\` is the source of truth for the leaf's \`INDEX.md\` entry text —
it must match that entry exactly (whitespace-normalized). A folio SHOULD
declare \`description\` as required in its own \`SCHEMA.md\`; the format itself
only recommends it.

Then use one \`# Title\` heading and concise sections.

## Writing style

Write Folio leaves like concise technical notes.

Principles:

- human-readable first
- LLM-friendly as a consequence
- brief enough to scan
- exact enough to act on
- one idea per paragraph
- bullets for sets
- tables for comparisons
- code blocks for exact commands, paths, or shapes
- direct headings
- preserve decisions, constraints, rationale, open questions, and next reads

Avoid transcript summaries, throat-clearing, and narrative buildup.

Prefer:

\`\`\`md
## Decision

Use draft pull requests as the folio draft record.

## Rationale

- review happens before the change is published
- GitHub stores comments, diffs, commits, and authorship
- merged \`main\` stays canonical
\`\`\`

Avoid:

\`\`\`md
We discussed several possible options and eventually landed on the idea that PRs might be useful...
\`\`\`

Concise does not mean vague. Keep names, commands, paths, dates, and tradeoffs
when they are useful.

## Links

Prefer bare bracket links:

\`\`\`md
[[project-roadmap]]
[[team-projects]]
\`\`\`

Use shallow folio-root-relative path links only when directories are useful:

\`\`\`md
[[clients/acme]]
\`\`\`

Avoid relative path markers like \`[[../foo]]\` and \`[[./foo]]\`.
Use regular Markdown links for external URLs only — never for leaf
relationships.

## Index

Every leaf MUST be represented in root \`INDEX.md\`. Update the relevant
section when adding, deleting, or materially reframing a page.

\`INDEX.md\` should contain useful descriptions, not just a generated file list.
It may be written by humans, LLMs, or Folio tooling.

An index entry takes the form \`- [[leaf]] — description\`. When the leaf
carries a \`description\` frontmatter field, use that description's exact text
after the em dash — description-sync lint checks the two match.

## Folio drafts

Never treat unmerged folio drafts as canonical truth. Keep each draft small
and topical. For the full ritual — manual or CLI — see
\`references/workflow-cli.md\` and \`references/workflow-manual.md\`.
`
};

// src/skill-scent.ts
import { existsSync as existsSync3, readFileSync as readFileSync5, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join3 } from "node:path";
var SUFFIX_RE = /[ \t]*Bound folio:.*$/;
var SUFFIX_CAPTURE_RE = /Bound folio:[ \t]*(.*)$/;
function fieldLineRe(field) {
  return new RegExp(`^${field}:[ \\t]*(.*)$`, "m");
}
function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}
function frontmatterRange(lines) {
  if (lines[0]?.trim() !== "---")
    return null;
  for (let i = 1;i < lines.length; i++) {
    if (lines[i]?.trim() === "---")
      return { start: 1, end: i };
  }
  return null;
}
function frontmatterField(content, field) {
  const lines = content.split(`
`);
  const range = frontmatterRange(lines);
  if (!range)
    return;
  const re = fieldLineRe(field);
  for (let i = range.start;i < range.end; i++) {
    const match = lines[i].match(re);
    if (match)
      return unquote(match[1].trim());
  }
  return;
}
function readIndexDescription(repoRoot) {
  const indexPath = join3(repoRoot, "INDEX.md");
  if (!existsSync3(indexPath))
    return null;
  const value = frontmatterField(readFileSync5(indexPath, "utf-8"), "description");
  return value && value.trim() !== "" ? value.trim() : null;
}
function stripScent(description) {
  return description.replace(SUFFIX_RE, "").trimEnd();
}
function extractScent(description) {
  const match = description.match(SUFFIX_CAPTURE_RE);
  const scent = match?.[1]?.trim();
  return scent && scent !== "" ? scent : null;
}
function stampScent(description, scent) {
  const stock = stripScent(description);
  return scent ? `${stock} Bound folio: ${scent}` : stock;
}
function readSkillDescription(skillPath) {
  if (!existsSync3(skillPath))
    return;
  return frontmatterField(readFileSync5(skillPath, "utf-8"), "description");
}
function restampSkillFile(skillPath, repoRoot) {
  if (!existsSync3(skillPath))
    return;
  const content = readFileSync5(skillPath, "utf-8");
  const lines = content.split(`
`);
  const range = frontmatterRange(lines);
  if (!range)
    return;
  const re = fieldLineRe("description");
  let descLine = -1;
  for (let i = range.start;i < range.end; i++) {
    if (re.test(lines[i])) {
      descLine = i;
      break;
    }
  }
  if (descLine === -1)
    return;
  const current = unquote(lines[descLine].replace(/^description:[ \t]*/, "").trim());
  const scent = readIndexDescription(repoRoot);
  const next = stampScent(current, scent);
  if (next === current)
    return;
  lines[descLine] = `description: ${JSON.stringify(next)}`;
  writeFileSync2(skillPath, lines.join(`
`), "utf-8");
}

// src/commands.ts
function tableRow(marker, topic, status, pr) {
  return `  ${marker}${topic.padEnd(35)} ${status.padEnd(7)} ${pr}`;
}
function printStatusFooter(bound, path) {
  console.log("");
  if (bound === path) {
    console.log(`Bound to ${bound}`);
    return;
  }
  console.log(`Bound to ${bound} · ${path}`);
}
var REPO_SHAPE = /^[\w.-]+\/[\w.-]+$/;
function resolveBindTarget(target) {
  if (/^(\/|~\/|~$|\.\/|\.\.\/|\.$|\.\.$)/.test(target))
    return "local";
  return existsSync4(resolvePath(target)) ? "local" : "remote";
}
function currentBinding() {
  return { remote: readConfig("remote"), path: getPath() };
}
function describeBinding(b) {
  if (b.remote && b.path)
    return `${b.remote} · ${b.path}`;
  return b.remote ?? b.path ?? "(none)";
}
function checkRebind(next, force) {
  const current = currentBinding();
  if (!current.remote && !current.path)
    return true;
  if (current.remote === next.remote && current.path === next.path) {
    console.log(`Already bound to ${describeBinding(current)}.`);
    return false;
  }
  if (!force) {
    throw new Error(`Currently bound to ${describeBinding(current)}. All amendments will be lost. Use --force to re-bind.`);
  }
  return true;
}
function detachCurrent() {
  const old = baseRepo();
  if (existsSync4(AMEND_DIR)) {
    for (const entry of readdirSync2(AMEND_DIR)) {
      run(`rm -rf "${AMEND_DIR}/${entry}"`);
    }
  }
  if (existsSync4(`${old}/.git`)) {
    run(`git -C "${old}" worktree prune 2>/dev/null || true`, { quiet: true });
  }
}
function restampBoundSkill() {
  const skillDir = readConfig("skill");
  if (!skillDir)
    return;
  const skillPath = join4(skillDir, "SKILL.md");
  if (!existsSync4(skillPath))
    return;
  try {
    restampSkillFile(skillPath, baseRepo());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  (couldn't refresh skill description: ${msg})`);
  }
}
function bindLocal(path, force) {
  const abs = resolvePath(path);
  if (!checkRebind({ remote: null, path: abs }, force))
    return;
  if (!existsSync4(abs)) {
    throw new Error(`No such directory: ${abs}. Run 'folio create ${path}'?`);
  }
  if (!existsSync4(`${abs}/.git`)) {
    throw new Error(`${abs} is not a git repository. Run 'git init -b main' there or 'folio create <path>'.`);
  }
  const hasMain = run(`git -C "${abs}" rev-parse --verify main 2>/dev/null`, {
    quiet: true
  }).exitCode === 0;
  if (!hasMain) {
    throw new Error(`${abs} has no 'main' branch. Folio uses main as published truth.`);
  }
  ensureConfig();
  detachCurrent();
  writeConfig("path", abs);
  writeConfig("strategy", "merge");
  writeConfig("remote", "");
  ensureBase();
  console.log(`✓ Bound to ${abs} (local).`);
  const origin = parseGitHubOrigin(abs);
  if (origin) {
    console.log(`  origin is github.com/${origin} — 'folio config strategy pr' to review via draft PRs.`);
  }
  restampBoundSkill();
}
function checkRemoteAccess(remote) {
  console.log(`Checking access to ${remote}...`);
  const authCheck = run(`git ls-remote git@github.com:${remote}.git HEAD`, {
    quiet: true
  });
  if (authCheck.exitCode !== 0) {
    throw new Error(`Cannot access ${remote}. Check your SSH setup or repo URL. Run: gh auth status`);
  }
}
function bindRemote(remote, force) {
  if (!checkRebind({ remote, path: null }, force))
    return;
  checkRemoteAccess(remote);
  ensureConfig();
  if (existsSync4(`${BASE_REPO}/.git`)) {
    const existingUrl = run(`git -C "${BASE_REPO}" remote get-url origin 2>/dev/null || echo ""`, { quiet: true }).stdout;
    if (existingUrl !== `git@github.com:${remote}.git`) {
      console.log("Old clone points to a different remote. Re-cloning...");
      run(`rm -rf "${BASE_REPO}"`);
    }
  }
  detachCurrent();
  writeConfig("remote", remote);
  writeConfig("strategy", "pr");
  writeConfig("path", "");
  writeConfig("source", "");
  ensureBase(remote);
  run(`git -C "${BASE_REPO}" checkout main --quiet 2>/dev/null || git -C "${BASE_REPO}" checkout origin/main --quiet`, { quiet: true });
  const ff = run(`git -C "${BASE_REPO}" pull --ff-only origin main --quiet 2>/dev/null || echo "(main behind remote — run 'folio sync' to catch up)"`, { quiet: true });
  if (ff.stdout)
    console.log(`  ${ff.stdout}`);
  console.log(`✓ Bound to ${remote}.`);
  restampBoundSkill();
}
function bindRemoteInto(remote, path, force) {
  if (!REPO_SHAPE.test(remote) || existsSync4(resolvePath(remote))) {
    throw new Error(`'${remote}' doesn't look like <owner/repo>. Usage: folio bind <owner/repo> <path>`);
  }
  const abs = resolvePath(path);
  if (!checkRebind({ remote, path: abs }, force))
    return;
  if (existsSync4(abs) && readdirSync2(abs).length > 0) {
    throw new Error(`${abs} already exists and is not empty.`);
  }
  checkRemoteAccess(remote);
  ensureConfig();
  console.log(`Cloning ${remote} into ${abs}...`);
  const clone = run(`git clone --quiet git@github.com:${remote}.git "${abs}"`);
  if (clone.exitCode !== 0) {
    throw new Error(`Failed to clone ${remote}. Check access and try again.`);
  }
  run(`git -C "${abs}" config extensions.worktreeConfig true`, {
    quiet: true
  });
  detachCurrent();
  writeConfig("remote", remote);
  writeConfig("path", abs);
  writeConfig("strategy", "pr");
  writeConfig("source", "");
  console.log(`✓ Bound to ${remote} at ${abs}.`);
  restampBoundSkill();
}
function cmdBind(args) {
  const positionals = args.filter((a) => !a.startsWith("--"));
  const target = positionals[0];
  const pathArg = positionals[1];
  if (!target) {
    throw new Error("Usage: folio bind <ns/repo | path> [path] [--remote|--local] [--web] [--force]");
  }
  const force = args.includes("--force");
  const hasWeb = args.includes("--web");
  const wantRemote = args.includes("--remote");
  const wantLocal = args.includes("--local");
  if (wantRemote && wantLocal) {
    throw new Error("--remote and --local are mutually exclusive.");
  }
  if (pathArg) {
    if (wantLocal) {
      throw new Error("--local doesn't apply to 'folio bind <owner/repo> <path>'.");
    }
    bindRemoteInto(target, pathArg, force);
    if (hasWeb)
      cmdWeb([]);
    return;
  }
  const kind = wantRemote ? "remote" : wantLocal ? "local" : resolveBindTarget(target);
  if (kind === "local") {
    bindLocal(target, force);
    return;
  }
  bindRemote(target, force);
  if (hasWeb) {
    cmdWeb([]);
  }
}
var INDEX_SCAFFOLD = `# Index

Map of this folio. List leaves under useful headings with bracket links to
each leaf and a short description of what it holds.
`;
var SCHEMA_SCAFFOLD = `# SCHEMA

Local conventions for this folio.

## Naming

- kebab-case filenames
- namespace prefixes for grouping, e.g. project-, patterns-

## Links

- bracket links between leaves, resolved by filename without the .md extension
- keep leaves listed in INDEX.md
`;
function cmdCreate(args) {
  const target = args.find((a) => !a.startsWith("--"));
  if (!target)
    throw new Error("Usage: folio create <path> [--force]");
  const abs = resolvePath(target);
  if (existsSync4(abs) && readdirSync2(abs).length > 0) {
    throw new Error(`${abs} already exists and is not empty.`);
  }
  mkdirSync2(abs, { recursive: true });
  writeFileSync3(`${abs}/INDEX.md`, INDEX_SCAFFOLD, "utf-8");
  writeFileSync3(`${abs}/SCHEMA.md`, SCHEMA_SCAFFOLD, "utf-8");
  const init = run(`git -C "${abs}" init -b main --quiet && git -C "${abs}" add -A && git -C "${abs}" commit -m "folio: scaffold INDEX and SCHEMA" --quiet`);
  if (init.exitCode !== 0) {
    throw new Error(`git init failed in ${abs}: ${init.stderr}`);
  }
  console.log(`✓ Created folio at ${abs}`);
  console.log("  INDEX.md, SCHEMA.md");
  console.log("  git init, initial commit");
  bindLocal(abs, args.includes("--force"));
}
function cmdDraft(args) {
  ensureConfig();
  ensureBase();
  if (hasRemote())
    fetchMain();
  let force = false;
  let topic = "";
  for (const arg of args) {
    if (arg === "--force")
      force = true;
    else
      topic = arg;
  }
  if (!topic) {
    throw new Error("Usage: folio draft <topic> [--force]");
  }
  const slug = topicToSlug(topic);
  const path = amendmentPath(slug);
  if (worktreeExists(path)) {
    const branch2 = amendmentBranch(path);
    const merged = isMergedToMain(branch2);
    if (merged) {
      if (force) {
        console.log(`Draft '${branch2}' was already published. Deleting and starting fresh...`);
        run(`git -C "${baseRepo()}" branch -D "${branch2}" 2>/dev/null || true`);
        if (hasRemote()) {
          run(`git -C "${baseRepo()}" push origin --delete "${branch2}" 2>/dev/null || true`);
        }
        run(`rm -rf "${path}"`);
      } else {
        throw new Error(`draft '${slug}' was already published. Use 'draft ${topic} --force' to restart.`);
      }
    } else {
      console.log(`Rebasing ${slug} onto main...`);
      const rebase = run(`git -C "${path}" rebase ${mainRef()} --quiet 2>/dev/null`, { quiet: true });
      if (rebase.exitCode !== 0) {
        throw new Error(`Rebase conflict in ${slug}. Resolve in ${path}/ then re-run 'folio proof'.`);
      }
      if (hasRemote()) {
        run(`git -C "${path}" pull --rebase --quiet 2>/dev/null || true`);
      }
      console.log(`✓ Resumed draft '${slug}'.`);
      return;
    }
  }
  if (worktreeExists(path)) {
    throw new Error(`draft '${slug}' already exists. Drop it first.`);
  }
  const branch = `amend/${slug}`;
  console.log(`Creating draft worktree for '${slug}'...`);
  const wt = run(`git -C "${baseRepo()}" worktree add -b "${branch}" "${path}" ${mainRef()} --quiet 2>/dev/null`);
  if (wt.exitCode !== 0) {
    throw new Error(`Failed to create worktree for '${slug}'.`);
  }
  console.log(`✓ Draft '${slug}' created.`);
  console.log(`  store: ${path}/`);
  console.log(`  next:  edit leaves in the store, then`);
  console.log(`         folio proof ${topic}`);
}
var VERB_EXAMPLES = {
  proof: "folio proof <topic>",
  publish: "folio publish <topic>",
  drop: "folio drop <topic> --force"
};
function extractTopic(args, valueFlags = []) {
  const rest = [];
  let topic;
  for (let i = 0;i < args.length; i++) {
    const arg = args[i];
    if (valueFlags.includes(arg)) {
      rest.push(arg);
      if (i + 1 < args.length) {
        rest.push(args[++i]);
      }
      continue;
    }
    if (topic === undefined && !arg.startsWith("-")) {
      topic = arg;
      continue;
    }
    rest.push(arg);
  }
  return { topic, rest };
}
function resolveDraft(verb, args, valueFlags = [], adoptRemote = false) {
  const { topic: explicit, rest } = extractTopic(args, valueFlags);
  const topic = explicit ?? process.env.FOLIO_DRAFT;
  if (!topic) {
    const example = VERB_EXAMPLES[verb] ?? `folio ${verb} <topic>`;
    throw new Error(`No draft specified. Pass a topic ('${example}') or set FOLIO_DRAFT.`);
  }
  const slug = topicToSlug(topic);
  const path = amendmentPath(slug);
  if (!worktreeExists(path)) {
    if (adoptRemote && getStrategy() === "pr" && hasRemote()) {
      const remote = getRemote();
      const branch = `amend/${slug}`;
      const pr = findOpenPRResult(remote, branch);
      if (pr.error) {
        throw new Error(`Could not look up remote draft '${slug}': ${pr.error}`);
      }
      if (!pr.number) {
        throw new Error(`Worktree for '${slug}' not found, and no open PR exists for ${branch}. Run 'folio draft ${topic}'.`);
      }
      const branchExists = run(`git -C "${baseRepo()}" show-ref --verify --quiet "refs/heads/${branch}"`, { quiet: true }).exitCode === 0;
      console.log(`Adopting remote-only draft '${slug}' from PR #${pr.number}...`);
      const fetch = run(`git -C "${baseRepo()}" fetch origin "${branch}" --quiet 2>&1`, { quiet: true });
      if (fetch.exitCode !== 0) {
        throw new Error(`Could not fetch remote draft '${slug}' from ${branch}: ${fetch.stderr || fetch.stdout}`);
      }
      if (branchExists) {
        const reset = run(`git -C "${baseRepo()}" branch -f "${branch}" "origin/${branch}" --quiet 2>&1`, { quiet: true });
        if (reset.exitCode !== 0) {
          throw new Error(`Could not reset local draft branch '${branch}' to origin/${branch}: ${reset.stderr || reset.stdout}`);
        }
      }
      const worktree = branchExists ? run(`git -C "${baseRepo()}" worktree add "${path}" "${branch}" --quiet 2>&1`, { quiet: true }) : run(`git -C "${baseRepo()}" worktree add -b "${branch}" "${path}" "origin/${branch}" --quiet 2>&1`, { quiet: true });
      if (worktree.exitCode !== 0) {
        throw new Error(`Could not create worktree for remote draft '${slug}': ${worktree.stderr || worktree.stdout}`);
      }
      return { slug, path, rest };
    }
    throw new Error(`Worktree for '${slug}' not found. Run 'folio draft ${topic}'.`);
  }
  return { slug, path, rest };
}
function draftHasChanges(path) {
  return run(`git -C "${path}" diff --quiet 2>/dev/null || echo dirty`, {
    quiet: true
  }).stdout !== "" || run(`git -C "${path}" diff --cached --quiet 2>/dev/null || echo dirty`, {
    quiet: true
  }).stdout !== "" || run(`git -C "${path}" ls-files --others --exclude-standard 2>/dev/null`, {
    quiet: true
  }).stdout !== "";
}
function findOpenPR(remote, branch) {
  const pr = findOpenPRResult(remote, branch);
  return pr.number;
}
function findOpenPRResult(remote, branch) {
  const prNum = gh(`pr list --head "${branch}" --state open --json number --jq '.[0].number'`, remote);
  if (prNum.exitCode !== 0) {
    return { number: "", error: prNum.stderr || prNum.stdout || "gh failed" };
  }
  return {
    number: prNum.stdout && prNum.stdout !== "null" ? prNum.stdout : "",
    error: ""
  };
}
var LOCK_PATH = `${STORE_DIR}/.lock`;
var LOCK_STALE_MS = 60000;
var LOCK_WAIT_MS = 5000;
function lockAgeMs() {
  try {
    return Date.now() - statSync3(LOCK_PATH).mtimeMs;
  } catch {
    return null;
  }
}
function acquireMainLock() {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;; ) {
    try {
      mkdirSync2(LOCK_PATH);
      return;
    } catch (err) {
      if (err.code !== "EEXIST")
        throw err;
      const age = lockAgeMs();
      if (age === null || age > LOCK_STALE_MS) {
        run(`rm -rf "${LOCK_PATH}"`, { quiet: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error("Another folio process is updating the shared repo. Try again shortly.");
      }
      run("sleep 0.2", { quiet: true });
    }
  }
}
function releaseMainLock() {
  run(`rm -rf "${LOCK_PATH}"`, { quiet: true });
}
function withMainLock(fn) {
  acquireMainLock();
  try {
    return fn();
  } finally {
    releaseMainLock();
  }
}
function commitDraftChanges(path, slug, rest) {
  let msg = `amend: ${slug}`;
  const mIdx = rest.indexOf("-m");
  if (mIdx >= 0 && mIdx + 1 < rest.length) {
    msg = rest[mIdx + 1];
  }
  run(`git -C "${path}" add -A`);
  const commit = run(`git -C "${path}" commit -m "${msg.replace(/"/g, "\\\"")}" --quiet`);
  if (commit.exitCode !== 0) {
    throw new Error(`Commit failed: ${commit.stderr || commit.stdout}`);
  }
}
function cmdProof(args) {
  ensureConfig();
  const local = getStrategy() === "merge";
  const remote = local ? "" : getRemote();
  if (!local)
    ensureGh();
  const { slug, path, rest } = resolveDraft("proof", args, ["-m"], true);
  const branch = amendmentBranch(path);
  if (!branch || branch === "?") {
    throw new Error(`Draft '${slug}' is not on a branch.`);
  }
  if (draftHasChanges(path)) {
    commitDraftChanges(path, slug, rest);
  }
  const lintResult = lint(path, { spec: "folio" });
  printLintResult(lintResult);
  if (hasLintErrors(lintResult)) {
    throw new Error(`Lint found issues in '${slug}'. Fix them, then re-run 'folio proof ${slug}'.`);
  }
  console.log(`Rebasing '${branch}' onto main...`);
  const rebase = run(`git -C "${path}" rebase ${mainRef()} --quiet 2>/dev/null`);
  if (rebase.exitCode !== 0) {
    throw new Error(`REBASE CONFLICT in ${slug} — resolve in ${path}/ then re-run 'folio proof ${slug}'.`);
  }
  if (local) {
    const diffStat = run(`git -C "${path}" diff ${mainRef()}...HEAD --stat 2>/dev/null`, { quiet: true }).stdout;
    console.log(`✓ Proofed '${slug}' — changes vs main:`);
    console.log(diffStat || "  (no changes)");
    console.log(`Run 'folio publish ${slug}' when ready.`);
    return;
  }
  const push = run(`git -C "${path}" push --force-with-lease origin "${branch}" --quiet 2>&1`);
  if (push.exitCode !== 0) {
    throw new Error("Push failed. Check network and access.");
  }
  const prNum = findOpenPR(remote, branch);
  const msg = run(`git -C "${path}" log -1 --format=%B`, {
    quiet: true
  }).stdout;
  const title = (msg.split(`
`)[0] || `amend: ${slug}`).replace(/"/g, "\\\"");
  if (!prNum) {
    const prResult = run(`gh pr create --repo "${remote}" --base main --head "${branch}" --draft --title "${title}" --body "${msg.replace(/"/g, "\\\"")}"`, { quiet: true });
    if (prResult.exitCode !== 0) {
      throw new Error(`PR creation failed: ${prResult.stderr}`);
    }
    const newPrNum = prResult.stdout.match(/(\d+)$/)?.[0] || "?";
    console.log(`✓ Proofed '${slug}' — draft PR #${newPrNum} opened`);
    console.log(`  https://github.com/${remote}/pull/${newPrNum}`);
  } else {
    run(`gh pr edit --repo "${remote}" ${prNum} --title "${title}" --body "${msg.replace(/"/g, "\\\"")}" 2>/dev/null || true`, { quiet: true });
    console.log(`✓ Proofed '${slug}' — draft PR #${prNum} updated`);
    console.log(`  https://github.com/${remote}/pull/${prNum}`);
  }
  console.log(`  Review on GitHub and mark it ready, then run 'folio publish ${slug}'.`);
}
function cleanupDraft(slug, path, branch) {
  run(`git -C "${baseRepo()}" worktree remove "${path}" --force 2>/dev/null || rm -rf "${path}"`);
  run(`git -C "${baseRepo()}" branch -D "${branch}" 2>/dev/null || true`);
  console.log(`  Draft '${slug}' closed.`);
}
function ensurePublishCurrency(slug, branch) {
  if (getStrategy() === "pr") {
    fetchMain();
  }
  const check = run(`git -C "${baseRepo()}" merge-base --is-ancestor ${mainRef()} "${branch}" 2>/dev/null`, { quiet: true });
  if (check.exitCode !== 0) {
    throw new Error(`main moved since proof — run 'folio proof ${slug} && folio publish ${slug}'`);
  }
}
function translatePublishFailure(slug, branch, prNum, output) {
  const text = output.trim() || "Merge failed.";
  if (/(still a draft|draft state|draft pull request)/i.test(text)) {
    if (prNum) {
      return `PR #${prNum} is still a draft — flip ready on GitHub, then re-run 'folio publish ${slug}'`;
    }
    return `Draft PR is still a draft — flip ready on GitHub, then re-run 'folio publish ${slug}'`;
  }
  if (/(merge conflict|conflict|not up to date|out of date|behind|main moved|rebase)/i.test(text)) {
    return `Merge blocked by conflicts or a stale branch — run 'folio proof ${slug}' first.`;
  }
  if (/(protected branch|branch protection|required status checks|ruleset)/i.test(text)) {
    return `Merge blocked by branch protection: ${text}. Check repository settings or required status checks.`;
  }
  return `Merge failed for ${branch}: ${text}`;
}
function cmdPublish(args) {
  ensureConfig();
  const local = getStrategy() === "merge";
  const remote = local ? "" : getRemote();
  if (!local)
    ensureGh();
  const { slug, path } = resolveDraft("publish", args);
  const branch = amendmentBranch(path);
  if (!branch || branch === "?") {
    throw new Error(`Draft '${slug}' is not on a branch.`);
  }
  if (local) {
    ensurePublishCurrency(slug, branch);
    const merge2 = withMainLock(() => run(`git -C "${baseRepo()}" merge "${branch}" --squash --quiet 2>&1`));
    if (merge2.exitCode !== 0) {
      throw new Error(translatePublishFailure(slug, branch, undefined, merge2.stderr || merge2.stdout));
    }
    const commit = withMainLock(() => run(`git -C "${baseRepo()}" commit -m "publish: ${slug}" --quiet 2>&1`));
    if (commit.exitCode !== 0) {
      throw new Error(`Merge commit failed: ${commit.stderr || commit.stdout}`);
    }
    console.log(`✓ Published '${slug}' into main.`);
    cleanupDraft(slug, path, branch);
    return;
  }
  const prNum = findOpenPR(remote, branch);
  if (!prNum) {
    throw new Error(`No open PR for '${slug}'. Run 'folio proof ${slug}' first to send it for review.`);
  }
  ensurePublishCurrency(slug, branch);
  const merge = run(`gh pr merge --repo "${remote}" ${prNum} --squash --delete-branch 2>&1`);
  if (merge.exitCode !== 0) {
    throw new Error(translatePublishFailure(slug, branch, prNum, merge.stderr || merge.stdout));
  }
  console.log(`✓ Published '${slug}' — PR #${prNum} merged.`);
  const ff = withMainLock(() => run(`git -C "${baseRepo()}" checkout main --quiet 2>/dev/null && git -C "${baseRepo()}" pull --ff-only origin main --quiet 2>/dev/null`, { quiet: true }));
  if (ff.exitCode !== 0) {
    console.log("  (couldn't fast-forward main from origin — run 'folio status -u')");
  }
  cleanupDraft(slug, path, branch);
}
function cmdDrop(args) {
  const { topic: explicit, rest } = extractTopic(args);
  const force = rest.includes("--force");
  const topic = explicit ?? process.env.FOLIO_DRAFT;
  if (!topic) {
    throw new Error(`No draft specified. Pass a topic ('${VERB_EXAMPLES.drop}') or set FOLIO_DRAFT.`);
  }
  const slug = topicToSlug(topic);
  const path = amendmentPath(slug);
  if (!worktreeExists(path)) {
    throw new Error(`Amendment '${slug}' not found.`);
  }
  const branch = amendmentBranch(path);
  const remoteBound = hasRemote();
  const merge = getStrategy() === "merge";
  const remote = remoteBound ? getRemote() : "";
  let prNum = "";
  if (remoteBound && branch && branch !== "?") {
    const prResult = gh(`pr list --head "${branch}" --state open --json number --jq '.[0].number'`, remote);
    if (prResult.stdout && prResult.stdout !== "null") {
      prNum = prResult.stdout;
    }
  }
  const dirty = isDirty(path);
  if (prNum) {
    if (dirty) {
      console.log(`  amendment '${slug}' has an open draft PR (#${prNum}) and uncommitted changes.`);
    } else {
      console.log(`  amendment '${slug}' has an open draft PR (#${prNum}).`);
    }
    console.log("  --force will close the PR, delete the remote branch, and remove local worktree.");
  } else if (dirty) {
    console.log(`  amendment '${slug}' has uncommitted changes. --force discards them.`);
  } else {
    console.log(`  amendment '${slug}' is clean.`);
  }
  if (!force) {
    throw new Error("Use --force to confirm deletion.");
  }
  if (prNum) {
    run(`gh pr close --repo "${remote}" "${prNum}" 2>/dev/null || true`);
    console.log(`  Closed PR #${prNum}.`);
  }
  if (remoteBound && branch && branch !== "?") {
    run(`git -C "${baseRepo()}" push origin --delete "${branch}" 2>/dev/null || true`);
    console.log(`  Deleted remote branch '${branch}'.`);
  }
  run(`git -C "${baseRepo()}" worktree remove "${path}" --force 2>/dev/null || rm -rf "${path}"`);
  if (merge && branch && branch !== "?") {
    run(`git -C "${baseRepo()}" branch -D "${branch}" 2>/dev/null || true`);
  }
  console.log(`✓ Dropped amendment '${slug}'.`);
}
function printSkillDrift() {
  const skillDir = readConfig("skill");
  if (!skillDir)
    return;
  const skillPath = join4(skillDir, "SKILL.md");
  const current = readSkillDescription(skillPath);
  if (current === undefined)
    return;
  const installedScent = extractScent(current);
  const liveScent = readIndexDescription(baseRepo());
  if (installedScent === liveScent)
    return;
  console.log("Skill description out of date, run `folio skill install`");
}
function draftState(d) {
  if (d.status === "dirty")
    return "dirty";
  if (d.prNumber) {
    return d.prDraft ? `proofed · PR #${d.prNumber} draft` : `proofed · PR #${d.prNumber} ready`;
  }
  return "saved";
}
function branchIncludesMain(branch) {
  return run(`git -C "${baseRepo()}" merge-base --is-ancestor ${mainRef()} "${branch}" 2>/dev/null`, { quiet: true }).exitCode === 0;
}
function cmdStatus(args = []) {
  ensureConfig();
  const remote = readConfig("remote");
  const boundPath = getPath();
  if (!remote && !boundPath) {
    console.log("No repo bound. Run 'folio bind <ns/repo | path>' or 'folio create <path>'.");
    return;
  }
  printSkillDrift();
  const update = args.includes("-u") || args.includes("--update");
  const bound = boundPath ?? remote;
  const base = baseRepo();
  let fetchFailed = false;
  if (hasRemote()) {
    const before = run(`git -C "${base}" rev-parse origin/main 2>/dev/null`, {
      quiet: true
    }).stdout;
    fetchMain();
    const after = run(`git -C "${base}" rev-parse origin/main 2>/dev/null`, {
      quiet: true
    }).stdout;
    fetchFailed = before === "" && after === "";
  }
  const staleNote = fetchFailed ? " (couldn't reach remote — showing cached state)" : "";
  const mainDirty = run(`git -C "${base}" diff --quiet -- '*.md' 2>/dev/null || echo dirty`, {
    quiet: true
  }).stdout !== "" || run(`git -C "${base}" diff --cached --quiet -- '*.md' 2>/dev/null || echo dirty`, { quiet: true }).stdout !== "";
  if (mainDirty) {
    console.log("Main has unsaved changes");
  } else {
    const behind = mainExists() ? behindCount() : 0;
    if (behind > 0) {
      if (update) {
        const pull = withMainLock(() => run(`git -C "${base}" pull --ff-only origin main --quiet 2>&1`));
        if (pull.exitCode !== 0) {
          throw new Error(`Update failed: ${pull.stderr || pull.stdout}`);
        }
        console.log("Up to date");
      } else {
        console.log(`Needs update, run \`folio status -u\`${staleNote}`);
      }
    } else {
      console.log(`Up to date${staleNote}`);
    }
  }
  const drafts = listAmendments();
  if (getStrategy() === "pr" && remote) {
    const remoteDrafts = listOpenPRMap(remote);
    const rows = new Map;
    for (const draft of drafts) {
      const branch = `amend/${draft.topic}`;
      const info = remoteDrafts.get(branch);
      const proofed = info && draft.status !== "dirty" && branchIncludesMain(branch);
      rows.set(branch, {
        topic: draft.topic,
        state: info ? `${proofed ? "proofed" : "unproofed"} · PR #${info.number} ${info.isDraft ? "(draft)" : "(ready)"}` : "unproofed",
        branch
      });
    }
    for (const [branch, info] of remoteDrafts) {
      if (rows.has(branch))
        continue;
      const topic = branch.startsWith("amend/") ? branch.slice("amend/".length) : branch;
      rows.set(branch, {
        topic,
        state: `unproofed · PR #${info.number} ${info.isDraft ? "(draft)" : "(ready)"}`,
        branch
      });
    }
    const ordered = [...rows.values()].sort((a, b) => a.topic.localeCompare(b.topic));
    if (ordered.length === 0) {
      console.log("No drafts");
    } else {
      console.log("");
      console.log("Drafts:");
      for (const row of ordered) {
        console.log(`  ${row.topic.padEnd(30)} ${row.state}`);
      }
    }
    printStatusFooter(bound, base);
    return;
  }
  if (drafts.length === 0) {
    console.log("No drafts");
  } else {
    console.log("");
    console.log("Drafts:");
    for (const d of drafts) {
      console.log(`  ${d.topic.padEnd(30)} ${draftState(d)}`);
    }
  }
  printStatusFooter(bound, base);
}
function cmdConfig(args) {
  ensureConfig();
  const key = args[0];
  const value = args[1];
  if (!key) {
    const remote = readConfig("remote") || "(not set)";
    const path = getPath() || "(not set)";
    const strategy = getStrategy();
    const store = readConfig("store") || "(not set)";
    const web = readConfig("web") || "(not set)";
    const bound = readConfig("remote") || getPath();
    console.log(`remote: ${remote}`);
    console.log(`path: ${path}`);
    console.log(`strategy: ${strategy}`);
    console.log(`store: ${store}`);
    console.log(`web: ${web}`);
    console.log(`resolved: ${bound ? baseRepo() : "(not bound)"}`);
    console.log(`amendments: ${AMEND_DIR}`);
    return;
  }
  if (!value) {
    const val = readConfig(key);
    console.log(val || "");
    return;
  }
  if (key === "path" || key === "source") {
    throw new Error("path is set at bind time — run 'folio bind <owner/repo | path> [path]' to move the checkout.");
  }
  if (key === "strategy") {
    if (value !== "merge" && value !== "pr") {
      throw new Error("strategy must be 'merge' or 'pr'.");
    }
    if (value === "pr" && !hasRemote()) {
      const origin = getPath() ? parseGitHubOrigin(baseRepo()) : null;
      if (origin) {
        throw new Error(`strategy pr needs a remote. origin is github.com/${origin} — run 'folio config remote ${origin}', then retry.`);
      }
      throw new Error("strategy pr needs a remote — run 'folio config remote <owner/repo>' first.");
    }
  }
  writeConfig(key, value);
}
function cmdWeb(args) {
  ensureConfig();
  const noOpen = args.includes("--no-open");
  const printUrl = args.includes("--print-url");
  const remote = readConfig("remote");
  if (!remote) {
    if (getPath()) {
      throw new Error("Bound to a local repo — folio web needs a GitHub remote. Run 'folio bind <ns/repo>'.");
    }
    throw new Error("No remote configured. Run 'folio bind <ns/repo>' first.");
  }
  const webUrl = readConfig("web") || "";
  let target = "";
  if (webUrl) {
    target = `${webUrl}/repos/${remote}`;
  } else {
    target = `https://github.com/${remote}/pulls`;
  }
  if (printUrl || noOpen) {
    console.log(target);
    return;
  }
  console.log(`Opening ${target} ...`);
  openBrowser(target);
  if (!webUrl) {
    console.log("");
    console.log("Folio Web URL not configured.");
    console.log("Set with: folio config web https://folio.example.com");
    console.log("Or connect during bind: folio bind <ns/repo> --web");
  }
}
function cmdList() {
  ensureConfig();
  if (mainExists())
    ensureBase();
  const amendments = listAmendments();
  console.log(tableRow("", "AMENDMENT", "STATUS", "PR"));
  if (amendments.length === 0) {
    console.log("No amendments. Run 'folio draft <topic>' to start one.");
    return;
  }
  for (const a of amendments) {
    console.log(tableRow("", a.topic, a.status, a.pr || ""));
  }
}
function cmdLint(args) {
  ensureConfig();
  const { topic, rest } = extractTopic(args, ["--spec"]);
  const json = rest.includes("--json");
  const strict = rest.includes("--strict");
  const specIdx = rest.indexOf("--spec");
  const spec = specIdx >= 0 ? rest[specIdx + 1] : "folio";
  if (specIdx >= 0 && !spec) {
    throw new Error("Usage: folio lint [<topic>] [--spec folio] [--json] [--strict]");
  }
  const draftTopic = topic ?? process.env.FOLIO_DRAFT;
  let storeDir;
  if (draftTopic) {
    const slug = topicToSlug(draftTopic);
    const path = amendmentPath(slug);
    if (!worktreeExists(path)) {
      throw new Error(`Worktree for '${slug}' not found. Run 'folio draft ${draftTopic}'.`);
    }
    storeDir = path;
  } else if (mainExists()) {
    storeDir = baseRepo();
  } else {
    throw new Error("No store found. Run 'folio bind <ns/repo | path>' first.");
  }
  const result = lint(storeDir, { spec });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printLintResult(result);
  }
  if (strict && hasLintErrors(result)) {
    process.exit(1);
  }
}
function skillInstall(target) {
  const recorded = readConfig("skill");
  const resolvedTarget = target ?? recorded;
  if (!resolvedTarget) {
    throw new Error("Usage: folio skill install <path> (no path recorded yet — pass one the first time)");
  }
  const abs = resolvePath(resolvedTarget);
  const files = Object.keys(skillBundle).sort();
  for (const rel of files) {
    const dest = join4(abs, rel);
    mkdirSync2(dirname(dest), { recursive: true });
    writeFileSync3(dest, skillBundle[rel], "utf-8");
    console.log(`wrote ${rel}`);
  }
  writeConfig("skill", abs);
  restampSkillFile(join4(abs, "SKILL.md"), baseRepo());
  console.log(`
${files.length} file(s) written to ${abs}`);
}
function cmdSkill(args) {
  const [sub, ...rest] = args;
  if (sub === "install") {
    skillInstall(rest[0]);
    return;
  }
  throw new Error("Usage: folio skill install [path]");
}

// src/index.ts
function die(msg) {
  console.error(`folio: ${msg}`);
  process.exit(1);
}
function help() {
  console.log(`
folio — knowledge management CLI

Usage:
  folio --version | -v             Print the CLI version
  folio bind <ns/repo> [--web]    Bind to a knowledge repo (one-time setup)
  folio bind <ns/repo> <path>      Bind to a knowledge repo, cloned into <path>
  folio bind <path>                Bind to a local git repo, in place
  folio create <path>              Scaffold a new folio and bind to it
  folio draft <topic>              Start or resume a draft (--force to restart)
  folio proof <topic>              Commit dirty work, lint, rebase; push + open draft PR (pr) or show diff (local)
  folio publish <topic>            Merge the draft into main
  folio status [-u]                Fleet dashboard: every draft's state; -u fast-forwards main
  folio drop <topic> --force       Delete a draft (local + remote)
  folio list                       List all drafts
  folio config                     Show global config
  folio config <key> <value>       Set config value
  folio web                        Open Folio Web or GitHub PR list for bound repo
  folio web --no-open              Print URL only
  folio lint [<topic>]             Check folio integrity (a draft, or main if omitted)
  folio lint --spec folio          Check with an explicit lint spec
  folio lint --json                Machine-readable output
  folio lint --strict              Exit 1 if any errors
  folio skill install [path]       Write the embedded folio skill into [path] (remembers it; re-run bare to refresh)

Edits go in ~/.config/folio/stores/amendments/<topic>/.
Flow: draft <topic> → edit → proof <topic> → publish <topic>.

Every draft verb resolves its topic as: explicit argument, then
$FOLIO_DRAFT, then an error. Set FOLIO_DRAFT once in a script or hook that
wraps the whole ritual in a single process; interactive agents should keep
passing the topic explicitly. Chain steps with && (e.g. folio draft my-topic
&& ... && folio proof my-topic) — verbs stay single-purpose.
`);
  process.exit(0);
}
var cmd = process.argv[2];
var args = process.argv.slice(3);
if (cmd === "--version" || cmd === "-v") {
  console.log(`folio ${package_default.version}`);
  process.exit(0);
}
try {
  switch (cmd) {
    case "bind":
      cmdBind(args);
      break;
    case "create":
      cmdCreate(args);
      break;
    case "draft":
      cmdDraft(args);
      break;
    case "proof":
      cmdProof(args);
      break;
    case "publish":
      cmdPublish(args);
      break;
    case "drop":
      cmdDrop(args);
      break;
    case "list":
      cmdList();
      break;
    case "status":
      cmdStatus(args);
      break;
    case "config":
      cmdConfig(args);
      break;
    case "web":
      cmdWeb(args);
      break;
    case "lint":
      cmdLint(args);
      break;
    case "skill":
      cmdSkill(args);
      break;
    case undefined:
    case "-h":
    case "--help":
      help();
      break;
    default:
      die(`unknown command '${cmd}'. Run 'folio --help' for usage.`);
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  die(msg);
}
