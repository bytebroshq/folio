#!/usr/bin/env node

// src/commands.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync2, readdirSync as readdirSync2, writeFileSync as writeFileSync2 } from "node:fs";

// ../core/src/lint/checks/frontmatter.ts
import { readFileSync } from "node:fs";
import { relative } from "node:path";
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
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

// ../core/src/lint/checks/links.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { basename as basename2, relative as relative2 } from "node:path";

// ../core/src/lint/files.ts
import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
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
    contentLeafFiles: allMdFiles.filter((file) => !structural.has(basename(file)))
  };
}

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

// ../core/src/lint/checks/links.ts
function linkCheck(ctx) {
  const issues = [];
  let pathLinkCount = 0;
  for (const file of ctx.files.allMdFiles) {
    const rel = relative2(ctx.storeDir, file);
    const content = readFileSync2(file, "utf-8");
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
          check: basename2(file) === "INDEX.md" ? "stale-index" : "broken-link",
          severity: "error",
          file: rel,
          line,
          message: `[[${link}]] → ${relative2(ctx.storeDir, target)} does not exist`
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
  const index = ctx.files.rootMdFiles.find((file) => basename2(file) === "INDEX.md");
  if (!index)
    return issues;
  const seen = new Map;
  for (const { link, line } of extractWikilinks(readFileSync2(index, "utf-8"))) {
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
  const index = ctx.files.rootMdFiles.find((file) => basename2(file) === "INDEX.md");
  if (!index)
    return issues;
  const indexed = new Set;
  for (const { link } of extractWikilinks(readFileSync2(index, "utf-8"))) {
    if (!hasRelativePathMarker(link))
      indexed.add(cleanLinkTarget(link));
  }
  for (const file of ctx.files.contentLeafFiles) {
    const relNoExt = relative2(ctx.storeDir, file).replace(/\.md$/, "");
    if (!indexed.has(relNoExt)) {
      issues.push({
        check: "orphan",
        severity: "error",
        file: relative2(ctx.storeDir, file),
        message: "not referenced in root INDEX.md"
      });
    }
  }
  return issues;
}

// ../core/src/lint/checks/naming.ts
import { basename as basename3, relative as relative3 } from "node:path";
function namingCheck(ctx) {
  const issues = [];
  const structural = new Set(ctx.spec.structuralFiles);
  for (const file of ctx.files.contentLeafFiles) {
    const name = basename3(file);
    if (structural.has(name))
      continue;
    if (!ctx.spec.leafFilenamePattern.test(name)) {
      issues.push({
        check: "naming",
        severity: "error",
        file: relative3(ctx.storeDir, file),
        message: `leaf filename must be ${ctx.spec.leafFilenameDescription}`
      });
    }
  }
  return issues;
}

// ../core/src/lint/checks/size.ts
import { statSync as statSync2 } from "node:fs";
import { relative as relative4 } from "node:path";
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
        file: relative4(ctx.storeDir, file),
        message: `${fmtBytes(bytes)}  ~${tokens.toLocaleString()} tokens (warn: ${ctx.spec.leafTokenWarn.toLocaleString()})`
      });
    }
  }
  return issues;
}

// ../core/src/lint/checks/structure.ts
import { join as join2, relative as relative5 } from "node:path";
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
    const rel = relative5(ctx.storeDir, file);
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
  { label: "FRONTMATTER", key: "frontmatter" }
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
  frontmatterCheck
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
import { existsSync, mkdirSync, readFileSync as readFileSync3, writeFileSync } from "node:fs";
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
  const raw = readFileSync3(CONFIG_FILE, "utf-8");
  if (!key)
    return raw;
  const match = raw.match(new RegExp(`^${key}:[^\\S\\n]*(.*)$`, "m"));
  const val = match ? match[1].trim() : null;
  return val && val !== "" ? val : null;
}
function writeConfig(key, value) {
  const file = existsSync(CONFIG_FILE) ? readFileSync3(CONFIG_FILE, "utf-8") : `remote: 
store: git
active: 
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
    writeConfig("active", "");
  }
}
function getActive() {
  return readConfig("active");
}
function setActive(topic) {
  writeConfig("active", topic);
}
function clearActive() {
  writeConfig("active", "");
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
function getSource() {
  return readConfig("source");
}
function isLocal() {
  return !!getSource();
}
function baseRepo() {
  return getSource() ?? BASE_REPO;
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
  return isLocal() ? "main" : "origin/main";
}
function ensureBase(remote) {
  const source = getSource();
  if (source) {
    if (!existsSync2(`${source}/.git`)) {
      throw new Error(`Bound local folio missing at ${source}. Re-run 'folio bind <path>'.`);
    }
    run(`git -C "${source}" config extensions.worktreeConfig true`, {
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
  if (isLocal())
    return;
  run(`git -C "${BASE_REPO}" fetch origin main --quiet`, { quiet: true });
}
function behindCount() {
  if (isLocal())
    return 0;
  const result = run(`git -C "${BASE_REPO}" rev-list --count HEAD..origin/main 2>/dev/null || echo 0`, { quiet: true });
  return Number.parseInt(result.stdout || "0", 10);
}
function isMergedToMain(branch) {
  fetchMain();
  const flag = isLocal() ? "" : "-r ";
  const needle = isLocal() ? branch : `origin/${branch}`;
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
function batchPRs(remote) {
  const map = new Map;
  const result = gh(`pr list --state open --json number,headRefName --jq '.[] | .headRefName + "@" + (.number|tostring)'`, remote);
  if (!result.stdout)
    return map;
  for (const line of result.stdout.split(`
`)) {
    const sep = line.lastIndexOf("@");
    if (sep === -1)
      continue;
    const branch = line.slice(0, sep);
    const num = line.slice(sep + 1);
    if (branch && num)
      map.set(branch, num);
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
  const prMap = remote ? batchPRs(remote) : new Map;
  for (const topic of topics) {
    const path = `${AMEND_DIR}/${topic}`;
    const dirty = isDirty(path);
    const status = dirty ? "dirty" : "clean";
    let pr;
    const branch = topicBranches.get(topic);
    if (branch) {
      const prNum = prMap.get(branch);
      if (prNum)
        pr = `PR #${prNum}`;
    }
    results.push({ topic, status, pr });
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
function isLocalTarget(target) {
  if (/^(\/|~\/|~$|\.\/|\.\.\/|\.$|\.\.$)/.test(target))
    return true;
  return existsSync3(resolvePath(target));
}
function currentBinding() {
  return getSource() ?? readConfig("remote");
}
function checkRebind(target, force) {
  const current = currentBinding();
  if (current === target) {
    console.log(`Already bound to ${target}.`);
    return false;
  }
  if (current && !force) {
    throw new Error(`Currently bound to ${current}. All amendments will be lost. Use --force to re-bind.`);
  }
  return true;
}
function bindLocal(path, force) {
  const abs = resolvePath(path);
  if (!checkRebind(abs, force))
    return;
  if (!existsSync3(abs)) {
    throw new Error(`No such directory: ${abs}. Run 'folio create ${path}'?`);
  }
  if (!existsSync3(`${abs}/.git`)) {
    throw new Error(`${abs} is not a git repository. Run 'git init -b main' there or 'folio create <path>'.`);
  }
  const hasMain = run(`git -C "${abs}" rev-parse --verify main 2>/dev/null`, {
    quiet: true
  }).exitCode === 0;
  if (!hasMain) {
    throw new Error(`${abs} has no 'main' branch. Folio uses main as published truth.`);
  }
  ensureConfig();
  writeConfig("source", abs);
  writeConfig("remote", "");
  clearActive();
  ensureBase();
  console.log(`✓ Bound to ${abs} (local).`);
}
function cmdBind(args) {
  const remote = args[0];
  if (!remote)
    throw new Error("Usage: folio bind <ns/repo | path> [--web]");
  const hasWeb = args.includes("--web");
  if (isLocalTarget(remote)) {
    bindLocal(remote, args.includes("--force"));
    return;
  }
  if (!checkRebind(remote, args.includes("--force")))
    return;
  console.log(`Checking access to ${remote}...`);
  const authCheck = run(`git ls-remote git@github.com:${remote}.git HEAD`, {
    quiet: true
  });
  if (authCheck.exitCode !== 0) {
    throw new Error(`Cannot access ${remote}. Check your SSH setup or repo URL. Run: gh auth status`);
  }
  ensureConfig();
  if (existsSync3(`${BASE_REPO}/.git`)) {
    const existingUrl = run(`git -C "${BASE_REPO}" remote get-url origin 2>/dev/null || echo ""`, { quiet: true }).stdout;
    if (existingUrl !== `git@github.com:${remote}.git`) {
      console.log("Old clone points to a different remote. Re-cloning...");
      run(`rm -rf "${BASE_REPO}"`);
    }
  }
  writeConfig("remote", remote);
  writeConfig("source", "");
  ensureBase(remote);
  run(`git -C "${BASE_REPO}" checkout main --quiet 2>/dev/null || git -C "${BASE_REPO}" checkout origin/main --quiet`, { quiet: true });
  const ff = run(`git -C "${BASE_REPO}" pull --ff-only origin main --quiet 2>/dev/null || echo "(main behind remote — run 'folio sync' to catch up)"`, { quiet: true });
  if (ff.stdout)
    console.log(`  ${ff.stdout}`);
  console.log(`✓ Bound to ${remote}.`);
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
  if (existsSync3(abs) && readdirSync2(abs).length > 0) {
    throw new Error(`${abs} already exists and is not empty.`);
  }
  mkdirSync2(abs, { recursive: true });
  writeFileSync2(`${abs}/INDEX.md`, INDEX_SCAFFOLD, "utf-8");
  writeFileSync2(`${abs}/SCHEMA.md`, SCHEMA_SCAFFOLD, "utf-8");
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
        if (!isLocal()) {
          run(`git push origin --delete "${branch2}" 2>/dev/null || true`);
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
      if (!isLocal()) {
        run(`git -C "${path}" pull --rebase --quiet 2>/dev/null || true`);
      }
      setActive(slug);
      console.log(`✓ Resumed draft '${slug}'.`);
      return;
    }
  }
  if (worktreeExists(path)) {
    throw new Error(`draft '${slug}' already exists. Drop it first.`);
  }
  ensureBase();
  if (!isLocal()) {
    run(`git -C "${BASE_REPO}" checkout main --quiet 2>/dev/null || true`);
    run(`git -C "${BASE_REPO}" pull --ff-only origin main --quiet 2>/dev/null || true`);
  }
  const branch = `amend/${slug}`;
  console.log(`Creating draft worktree for '${slug}'...`);
  const wt = run(`git -C "${baseRepo()}" worktree add -b "${branch}" "${path}" ${mainRef()} --quiet 2>/dev/null`);
  if (wt.exitCode !== 0) {
    throw new Error(`Failed to create worktree for '${slug}'.`);
  }
  setActive(slug);
  console.log(`✓ Draft '${slug}' created.`);
  console.log(`  store: ${path}/`);
}
function requireActiveDraft(verb) {
  const active = getActive();
  if (!active) {
    throw new Error(`No active draft. Run 'folio draft <topic>' before '${verb}'.`);
  }
  const path = amendmentPath(active);
  if (!worktreeExists(path)) {
    throw new Error(`Worktree for '${active}' not found. Run 'folio draft ${active}'.`);
  }
  return { active, path };
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
  const prNum = gh(`pr list --head "${branch}" --state open --json number --jq '.[0].number'`, remote).stdout;
  return prNum && prNum !== "null" ? prNum : "";
}
function cmdSave(args) {
  ensureConfig();
  const { active, path } = requireActiveDraft("save");
  let msg = `amend: ${active}`;
  const mIdx = args.indexOf("-m");
  if (mIdx >= 0 && mIdx + 1 < args.length) {
    msg = args[mIdx + 1];
  }
  if (!draftHasChanges(path)) {
    console.log(`Nothing to save in '${active}'.`);
    return;
  }
  run(`git -C "${path}" add -A`);
  const commit = run(`git -C "${path}" commit -m "${msg.replace(/"/g, "\\\"")}" --quiet`);
  if (commit.exitCode !== 0) {
    throw new Error(`Save failed: ${commit.stderr}`);
  }
  console.log(`Saved: ${msg}`);
}
function cmdProof(args) {
  ensureConfig();
  const local = isLocal();
  const remote = local ? "" : getRemote();
  if (!local)
    ensureGh();
  const { active, path } = requireActiveDraft("proof");
  const branch = amendmentBranch(path);
  if (!branch || branch === "?") {
    throw new Error(`Draft '${active}' is not on a branch.`);
  }
  if (draftHasChanges(path)) {
    cmdSave(args);
  }
  const lintResult = lint(path, { spec: "folio" });
  printLintResult(lintResult);
  if (hasLintErrors(lintResult)) {
    throw new Error(`Lint found issues in '${active}'. Fix them, 'folio save', then re-run 'folio proof'.`);
  }
  console.log(`Rebasing '${branch}' onto main...`);
  const rebase = run(`git -C "${path}" rebase ${mainRef()} --quiet 2>/dev/null`);
  if (rebase.exitCode !== 0) {
    throw new Error(`REBASE CONFLICT in ${active} — resolve in ${path}/ then re-run 'folio proof'.`);
  }
  if (local) {
    const diffStat = run(`git -C "${path}" diff ${mainRef()}...HEAD --stat 2>/dev/null`, { quiet: true }).stdout;
    console.log(`✓ Proofed '${active}' — changes vs main:`);
    console.log(diffStat || "  (no changes)");
    console.log("Run 'folio publish' when ready.");
    return;
  }
  const push = run(`git -C "${path}" push --force origin "${branch}" --quiet 2>&1`);
  if (push.exitCode !== 0) {
    throw new Error("Push failed. Check network and access.");
  }
  const prNum = findOpenPR(remote, branch);
  const msg = run(`git -C "${path}" log -1 --format=%B`, {
    quiet: true
  }).stdout;
  const title = (msg.split(`
`)[0] || `amend: ${active}`).replace(/"/g, "\\\"");
  if (!prNum) {
    const prResult = run(`gh pr create --repo "${remote}" --base main --head "${branch}" --draft --title "${title}" --body "${msg.replace(/"/g, "\\\"")}"`, { quiet: true });
    if (prResult.exitCode !== 0) {
      throw new Error(`PR creation failed: ${prResult.stderr}`);
    }
    const newPrNum = prResult.stdout.match(/(\d+)$/)?.[0] || "?";
    console.log(`✓ Proofed '${active}' — draft PR #${newPrNum} opened`);
    console.log(`  https://github.com/${remote}/pull/${newPrNum}`);
  } else {
    run(`gh pr edit --repo "${remote}" ${prNum} --title "${title}" --body "${msg.replace(/"/g, "\\\"")}" 2>/dev/null || true`, { quiet: true });
    console.log(`✓ Proofed '${active}' — draft PR #${prNum} updated`);
    console.log(`  https://github.com/${remote}/pull/${prNum}`);
  }
  console.log("  Review on GitHub and mark it ready, then run 'folio publish'.");
}
function cleanupDraft(active, path, branch) {
  run(`git -C "${baseRepo()}" worktree remove "${path}" --force 2>/dev/null || rm -rf "${path}"`);
  run(`git -C "${baseRepo()}" branch -D "${branch}" 2>/dev/null || true`);
  clearActive();
  console.log(`  Draft '${active}' closed.`);
}
function cmdPublish(_args) {
  ensureConfig();
  const local = isLocal();
  const remote = local ? "" : getRemote();
  if (!local)
    ensureGh();
  const { active, path } = requireActiveDraft("publish");
  const branch = amendmentBranch(path);
  if (!branch || branch === "?") {
    throw new Error(`Draft '${active}' is not on a branch.`);
  }
  if (draftHasChanges(path)) {
    throw new Error(`Draft '${active}' has unsaved changes. Run 'folio save' then 'folio proof' first.`);
  }
  if (local) {
    const merge2 = run(`git -C "${baseRepo()}" merge "${branch}" --no-edit --quiet 2>&1`);
    if (merge2.exitCode !== 0) {
      throw new Error(`Merge failed: ${merge2.stderr || merge2.stdout}`);
    }
    console.log(`✓ Published '${active}' into main.`);
    cleanupDraft(active, path, branch);
    return;
  }
  const prNum = findOpenPR(remote, branch);
  if (!prNum) {
    throw new Error(`No open PR for '${active}'. Run 'folio proof' first to send it for review.`);
  }
  const isDraft = gh(`pr view ${prNum} --json isDraft --jq .isDraft`, remote).stdout;
  if (isDraft === "true") {
    console.log(`PR #${prNum} is still a draft — review it on GitHub and mark it ready, then run 'folio publish'.`);
    return;
  }
  const merge = run(`gh pr merge --repo "${remote}" ${prNum} --squash --delete-branch 2>&1`);
  if (merge.exitCode !== 0) {
    throw new Error(`Merge failed: ${merge.stderr || merge.stdout}`);
  }
  console.log(`✓ Published '${active}' — PR #${prNum} merged.`);
  cleanupDraft(active, path, branch);
}
function cmdDrop(args) {
  let topic = "";
  let force = false;
  for (const arg of args) {
    if (arg === "--force")
      force = true;
    else
      topic = arg;
  }
  if (!topic)
    throw new Error("Usage: folio drop <topic> [--force]");
  const slug = topicToSlug(topic);
  const path = amendmentPath(slug);
  if (!worktreeExists(path)) {
    throw new Error(`Amendment '${slug}' not found.`);
  }
  const branch = amendmentBranch(path);
  const local = isLocal();
  const remote = local ? "" : getRemote();
  let prNum = "";
  if (!local && branch && branch !== "?") {
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
  if (!local && branch && branch !== "?") {
    run(`git push origin --delete "${branch}" 2>/dev/null || true`);
    console.log(`  Deleted remote branch '${branch}'.`);
  }
  run(`git -C "${baseRepo()}" worktree remove "${path}" --force 2>/dev/null || rm -rf "${path}"`);
  if (local && branch && branch !== "?") {
    run(`git -C "${baseRepo()}" branch -D "${branch}" 2>/dev/null || true`);
  }
  console.log(`✓ Dropped amendment '${slug}'.`);
  const active = getActive();
  if (active === slug) {
    clearActive();
    console.log("  (active cleared — on main now)");
  }
}
function cmdStatus(args = []) {
  ensureConfig();
  const remote = readConfig("remote");
  const source = getSource();
  if (!remote && !source) {
    console.log("No repo bound. Run 'folio bind <ns/repo | path>' or 'folio create <path>'.");
    return;
  }
  const local = isLocal();
  const extended = args.includes("-x") || args.includes("--extended") || args.includes("-f") || args.includes("--full");
  const update = args.includes("-u") || args.includes("--update");
  const bound = source ?? remote;
  let fetchFailed = false;
  if (!local) {
    const before = run(`git -C "${BASE_REPO}" rev-parse origin/main 2>/dev/null`, { quiet: true }).stdout;
    fetchMain();
    const after = run(`git -C "${BASE_REPO}" rev-parse origin/main 2>/dev/null`, { quiet: true }).stdout;
    fetchFailed = before === "" && after === "";
  }
  const staleNote = fetchFailed ? " (couldn't reach remote — showing cached state)" : "";
  const active = getActive();
  if (!active) {
    const path2 = baseRepo();
    console.log("No drafts");
    const dirty = run(`git -C "${path2}" diff --quiet -- '*.md' 2>/dev/null || echo dirty`, {
      quiet: true
    }).stdout !== "" || run(`git -C "${path2}" diff --cached --quiet -- '*.md' 2>/dev/null || echo dirty`, { quiet: true }).stdout !== "";
    if (dirty) {
      console.log("Main has unsaved changes");
    } else {
      const behind = mainExists() ? behindCount() : 0;
      if (behind > 0) {
        if (update) {
          const pull = run(`git -C "${BASE_REPO}" pull --ff-only origin main --quiet 2>&1`);
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
    printStatusFooter(bound, path2);
    if (extended) {
      const others = listAmendments();
      if (others.length > 0) {
        console.log("");
        console.log("Drafts:");
        for (const a of others) {
          console.log(`  ${a.topic} (${a.status})${a.pr ? ` — ${a.pr}` : ""}`);
        }
      }
    }
    return;
  }
  const path = amendmentPath(active);
  if (!worktreeExists(path)) {
    console.log(`On draft ${active}`);
    console.log(`Worktree missing, run \`folio draft ${active}\``);
    printStatusFooter(bound, path);
    return;
  }
  const branch = amendmentBranch(path);
  const hasCommits = run(`git -C "${path}" rev-list --count ${mainRef()}..HEAD 2>/dev/null`, {
    quiet: true
  }).stdout !== "0";
  console.log(`On draft ${active}`);
  if (isDirty(path)) {
    console.log("Pending save, run `folio save`");
  } else if (!hasCommits) {
    console.log("No changes yet");
  } else if (extended && !local && branch && branch !== "?") {
    const prNum = findOpenPR(remote, branch);
    if (!prNum) {
      console.log("Saved, run `folio proof`");
    } else {
      const isDraftPR = gh(`pr view ${prNum} --json isDraft --jq .isDraft`, remote).stdout;
      if (isDraftPR === "true") {
        console.log(`Proofed, PR #${prNum} draft`);
      } else {
        console.log(`PR #${prNum} ready, run \`folio publish\``);
      }
    }
  } else {
    console.log("Saved, run `folio proof`");
  }
  if (mainExists()) {
    const behind = behindCount();
    if (behind > 0) {
      console.log(`Main moved; proof will rebase (behind by ${behind})`);
    }
  }
  printStatusFooter(bound, path);
}
function cmdConfig(args) {
  ensureConfig();
  const key = args[0];
  const value = args[1];
  if (!key) {
    const remote = readConfig("remote") || "(not set)";
    const source = readConfig("source") || "(not set)";
    const active = readConfig("active") || "(not set)";
    const web = readConfig("web") || "(not set)";
    const store = readConfig("store") || "(not set)";
    const bound = readConfig("remote") || readConfig("source");
    console.log(`remote: ${remote}`);
    console.log(`source: ${source}`);
    console.log(`store: ${store}`);
    console.log(`web: ${web}`);
    console.log(`active: ${active}`);
    console.log(`path: ${bound ? baseRepo() : "(not bound)"}`);
    console.log(`amendments: ${AMEND_DIR}`);
    return;
  }
  if (!value) {
    const val = readConfig(key);
    console.log(val || "");
    return;
  }
  writeConfig(key, value);
}
function cmdWeb(args) {
  ensureConfig();
  const noOpen = args.includes("--no-open");
  const printUrl = args.includes("--print-url");
  const remote = readConfig("remote");
  if (!remote) {
    if (isLocal()) {
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
  const active = getActive();
  const amendments = listAmendments();
  console.log(tableRow("", "AMENDMENT", "STATUS", "PR"));
  if (amendments.length === 0) {
    console.log("No amendments. Run 'folio draft <topic>' to start one.");
    return;
  }
  for (const a of amendments) {
    const marker = a.topic === active ? "*" : " ";
    console.log(tableRow(marker, a.topic, a.status, a.pr || ""));
  }
}
function cmdLint(args) {
  ensureConfig();
  const json = args.includes("--json");
  const strict = args.includes("--strict");
  const specIdx = args.indexOf("--spec");
  const spec = specIdx >= 0 ? args[specIdx + 1] : "folio";
  if (specIdx >= 0 && !spec) {
    throw new Error("Usage: folio lint [--spec folio] [--json] [--strict]");
  }
  const active = getActive();
  let storeDir;
  if (active && existsSync3(`${AMEND_DIR}/${active}`)) {
    storeDir = `${AMEND_DIR}/${active}`;
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

// src/index.ts
function die(msg) {
  console.error(`folio: ${msg}`);
  process.exit(1);
}
function help() {
  console.log(`
folio — knowledge management CLI

Usage:
  folio bind <ns/repo> [--web]    Bind to a knowledge repo (one-time setup)
  folio bind <path>                Bind to a local git repo, in place
  folio create <path>              Scaffold a new folio and bind to it
  folio draft <topic>              Start or resume a draft (--force to restart)
  folio save [-m "msg"]             Save changes in the active draft
  folio proof                      Lint + rebase; push + open draft PR (pr) or show diff (local)
  folio publish                    Merge the draft into main (pr: only once PR is ready)
  folio status [-u] [-x]           Show current state; -u updates, -x includes PR context
  folio drop <topic> --force       Delete a draft (local + remote)
  folio list                       List all drafts
  folio config                     Show global config
  folio config <key> <value>       Set config value
  folio web                        Open Folio Web or GitHub PR list for bound repo
  folio web --no-open              Print URL only
  folio lint                       Check folio integrity
  folio lint --spec folio          Check with an explicit lint spec
  folio lint --json                Machine-readable output
  folio lint --strict              Exit 1 if any errors

Edits go in ~/.config/folio/stores/amendments/<topic>/.
Flow: draft → edit → save → proof → publish.
`);
  process.exit(0);
}
var cmd = process.argv[2];
var args = process.argv.slice(3);
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
    case "save":
      cmdSave(args);
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
