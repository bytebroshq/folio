#!/usr/bin/env bun
// @bun

// src/commands.ts
import { existsSync as existsSync3 } from "node:fs";

// src/config.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
var FOLIO_HOME = `${homedir()}/.config/folio`;
var STORE_DIR = `${FOLIO_HOME}/stores`;
var AMEND_DIR = `${STORE_DIR}/amendments`;
var CONFIG_FILE = `${FOLIO_HOME}/config.yml`;
var BASE_REPO = `${STORE_DIR}/.main`;
function readConfig(key) {
  if (!existsSync(CONFIG_FILE))
    return null;
  const raw = readFileSync(CONFIG_FILE, "utf-8");
  if (key) {
    const match = raw.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
    return match ? match[1].trim() : null;
  }
  return raw;
}
function writeConfig(key, value) {
  const file = existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, "utf-8") : `remote: jubalm/folio
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
    writeConfig("remote", "jubalm/folio");
    writeConfig("store", "git");
    writeConfig("active", "");
  }
}
function getActive() {
  const val = readConfig("active");
  return val && val !== "" ? val : null;
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
function ensureBase(remote) {
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
  return existsSync2(`${BASE_REPO}/.git`);
}
function fetchMain() {
  run(`git -C "${BASE_REPO}" fetch origin main --quiet`, { quiet: true });
}
function behindCount() {
  const result = run(`git -C "${BASE_REPO}" rev-list --count HEAD..origin/main 2>/dev/null || echo 0`, { quiet: true });
  return Number.parseInt(result.stdout || "0", 10);
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
  const remote = getRemote();
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
  const prMap = batchPRs(remote);
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
function listOpenPRs(remote) {
  const result = gh(`pr list --state open --json number,title,headRefName --jq '.[] | "#\\(.number)  \\(.title)  (\\(.headRefName))"'`, remote);
  if (!result.stdout)
    return [];
  return result.stdout.split(`
`);
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
function cmdBind(args) {
  const remote = args[0];
  if (!remote)
    throw new Error("Usage: folio bind <ns/repo> [--web]");
  const hasWeb = args.includes("--web");
  const currentRemote = readConfig("remote");
  if (currentRemote === remote) {
    console.log(`Already bound to ${remote}.`);
    return;
  }
  if (currentRemote && currentRemote !== "jubalm/folio") {
    if (!args.includes("--force")) {
      throw new Error(`Currently bound to ${currentRemote}. All amendments will be lost. Use --force to re-bind.`);
    }
  }
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
function cmdSwitch(args) {
  ensureConfig();
  ensureBase();
  if (args.length === 0) {
    const active = getActive();
    const amendments = listAmendments();
    console.log(tableRow("", "AMENDMENT", "STATUS", "PR"));
    if (amendments.length === 0) {
      console.log("No amendments. Run 'folio switch -c <topic>' to start one.");
      return;
    }
    for (const a of amendments) {
      const marker = a.topic === active ? "*" : " ";
      console.log(tableRow(marker, a.topic, a.status, a.pr || ""));
    }
    return;
  }
  let create = false;
  let force = false;
  let topic = "";
  for (const arg of args) {
    if (arg === "-c" || arg === "--create")
      create = true;
    else if (arg === "--force")
      force = true;
    else
      topic = arg;
  }
  if (create && topic) {
    cmdSwitchCreate(topic, force);
  } else if (topic) {
    cmdSwitchTo(topic);
  } else {
    throw new Error("Usage: folio switch <topic> | folio switch -c <topic>");
  }
}
function cmdSwitchCreate(topic, force) {
  const slug = topicToSlug(topic);
  const path = amendmentPath(slug);
  if (worktreeExists(path)) {
    const branch2 = amendmentBranch(path);
    const _remote = getRemote();
    fetchMain();
    const merged = run(`git -C "${BASE_REPO}" branch -r --merged origin/main 2>/dev/null | grep -q "origin/${branch2}" && echo yes || echo no`, { quiet: true }).stdout === "yes";
    if (merged) {
      if (force) {
        console.log(`Branch '${branch2}' was merged. Deleting and creating fresh...`);
        run(`git -C "${BASE_REPO}" branch -D "${branch2}" 2>/dev/null || true`);
        run(`git push origin --delete "${branch2}" 2>/dev/null || true`);
        run(`rm -rf "${path}"`);
      } else {
        throw new Error(`amendment '${slug}' exists and was merged. Use 'switch -c ${topic} --force' to restart.`);
      }
    } else {
      console.log(`Rebasing ${slug} onto main...`);
      const rebase = run(`git -C "${path}" rebase origin/main --quiet 2>/dev/null`, { quiet: true });
      if (rebase.exitCode !== 0) {
        throw new Error(`Rebase conflict in ${slug}. Resolve in ${path}/leaves/ then re-run 'folio sync'.`);
      }
      run(`git -C "${path}" pull --rebase --quiet 2>/dev/null || true`);
      setActive(slug);
      console.log(`✓ Switched to amendment '${slug}'.`);
      return;
    }
  }
  if (worktreeExists(path)) {
    throw new Error(`amendment '${slug}' already exists. Drop it first.`);
  }
  const remote = getRemote();
  ensureBase(remote);
  run(`git -C "${BASE_REPO}" checkout main --quiet 2>/dev/null || true`);
  run(`git -C "${BASE_REPO}" pull --ff-only origin main --quiet 2>/dev/null || true`);
  const branch = `amend/${slug}`;
  console.log(`Creating amendment worktree for '${slug}'...`);
  const wt = run(`git -C "${BASE_REPO}" worktree add -b "${branch}" "${path}" origin/main --quiet 2>/dev/null`);
  if (wt.exitCode !== 0) {
    throw new Error(`Failed to create worktree for '${slug}'.`);
  }
  setActive(slug);
  console.log(`✓ Amendment '${slug}' created.`);
  console.log(`  leaves: ${path}/leaves/`);
}
function cmdSwitchTo(topic) {
  const slug = topicToSlug(topic);
  const path = amendmentPath(slug);
  if (!worktreeExists(path)) {
    throw new Error(`amendment '${slug}' not found. Use 'folio switch -c ${topic}' to create one.`);
  }
  const branch = amendmentBranch(path);
  const _remote = getRemote();
  fetchMain();
  const merged = run(`git -C "${BASE_REPO}" branch -r --merged origin/main 2>/dev/null | grep -q "origin/${branch}" && echo yes || echo no`, { quiet: true }).stdout === "yes";
  if (merged) {
    throw new Error(`amendment '${slug}' was merged. Use 'switch -c ${topic} --force' to restart.`);
  }
  console.log(`Rebasing ${slug} onto main...`);
  const rebase = run(`git -C "${path}" rebase origin/main --quiet 2>/dev/null`, { quiet: true });
  if (rebase.exitCode !== 0) {
    throw new Error(`Rebase conflict in ${slug}. Resolve in ${path}/leaves/ then re-run 'folio sync'.`);
  }
  setActive(slug);
  console.log(`✓ Switched to amendment '${slug}'.`);
}
function cmdSync(args) {
  ensureGh();
  ensureConfig();
  const remote = getRemote();
  ensureBase(remote);
  const prs = listOpenPRs(remote);
  if (prs.length > 0) {
    console.log("Open PRs:");
    for (const prLine of prs) {
      if (prLine)
        console.log(`  ${prLine}`);
    }
    console.log("");
  }
  const active = getActive();
  if (!active) {
    console.log(`Pulling latest from ${remote}...`);
    const pull = run(`git -C "${BASE_REPO}" pull --ff-only origin main --quiet 2>/dev/null`);
    if (pull.exitCode !== 0) {
      throw new Error("Failed to pull main. Check network.");
    }
    const hasChanges2 = run(`git -C "${BASE_REPO}" diff --quiet -- leaves/ 2>/dev/null || echo dirty`, { quiet: true }).stdout !== "" || run(`git -C "${BASE_REPO}" diff --cached --quiet -- leaves/ 2>/dev/null || echo dirty`, { quiet: true }).stdout !== "";
    if (hasChanges2) {
      console.log("  (uncommitted edits in store/leaves/ — did you mean to amend?)");
    }
    console.log("✓ on main, synced.");
    return;
  }
  const path = amendmentPath(active);
  if (!worktreeExists(path)) {
    throw new Error(`Worktree for '${active}' not found. Run 'folio switch -c ${active}'.`);
  }
  const branch = amendmentBranch(path);
  if (!branch || branch === "?") {
    throw new Error(`Amendment '${active}' is not on a branch.`);
  }
  let msg = `amend: ${active}`;
  const mIdx = args.indexOf("-m");
  if (mIdx >= 0 && mIdx + 1 < args.length) {
    msg = args[mIdx + 1];
  }
  const hasChanges = run(`git -C "${path}" diff --quiet 2>/dev/null || echo dirty`, {
    quiet: true
  }).stdout !== "" || run(`git -C "${path}" diff --cached --quiet 2>/dev/null || echo dirty`, {
    quiet: true
  }).stdout !== "" || run(`git -C "${path}" ls-files --others --exclude-standard 2>/dev/null`, {
    quiet: true
  }).stdout !== "";
  if (hasChanges) {
    run(`git -C "${path}" add -A`);
    const commit = run(`git -C "${path}" commit -m "${msg.replace(/"/g, "\\\"")}" --quiet`);
    if (commit.exitCode !== 0) {
      throw new Error(`Commit failed: ${commit.stderr}`);
    }
    console.log(`Committed: ${msg}`);
  }
  console.log(`Rebasing '${branch}' onto main...`);
  const rebase = run(`git -C "${path}" rebase origin/main --quiet 2>/dev/null`);
  if (rebase.exitCode !== 0) {
    throw new Error(`REBASE CONFLICT in ${active} — resolve in ${path}/ then re-run 'folio sync'.`);
  }
  if (!hasChanges) {
    const localSha = run(`git -C "${path}" rev-parse HEAD 2>/dev/null`, {
      quiet: true
    }).stdout;
    const remoteSha = run(`git -C "${path}" rev-parse "origin/${branch}" 2>/dev/null || echo ""`, { quiet: true }).stdout;
    if (localSha && remoteSha && localSha === remoteSha) {
      console.log(`Everything up to date in '${active}'.`);
      return;
    }
  }
  const push = run(`git -C "${path}" push --force origin "${branch}" --quiet 2>&1`);
  if (push.exitCode !== 0) {
    throw new Error("Push failed. Check network and access.");
  }
  const prNum = gh(`pr list --head "${branch}" --state open --json number --jq '.[0].number'`, remote).stdout;
  if (!prNum || prNum === "null") {
    const prTitle = msg.split(`
`)[0];
    const prResult = run(`gh pr create --repo "${remote}" --base main --head "${branch}" --draft --title "${prTitle.replace(/"/g, "\\\"")}" --body "${msg.replace(/"/g, "\\\"")}"`, { quiet: true });
    if (prResult.exitCode !== 0) {
      throw new Error(`PR creation failed: ${prResult.stderr}`);
    }
    const newPrNum = prResult.stdout.match(/(\d+)$/)?.[0] || "?";
    console.log(`✓ Draft PR #${newPrNum} created`);
    console.log(`  https://github.com/${remote}/pull/${newPrNum}`);
  } else {
    if (hasChanges) {
      run(`gh pr edit --repo "${remote}" ${prNum} --title "${msg.split(`
`)[0].replace(/"/g, "\\\"")}" --body "${msg.replace(/"/g, "\\\"")}" 2>/dev/null || true`, { quiet: true });
    }
    console.log(`✓ Draft PR #${prNum} updated`);
    console.log(`  https://github.com/${remote}/pull/${prNum}`);
  }
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
  const remote = getRemote();
  let prNum = "";
  if (branch && branch !== "?") {
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
  if (branch && branch !== "?") {
    run(`git push origin --delete "${branch}" 2>/dev/null || true`);
    console.log(`  Deleted remote branch '${branch}'.`);
  }
  run(`git -C "${BASE_REPO}" worktree remove "${path}" --force 2>/dev/null || rm -rf "${path}"`);
  console.log(`✓ Dropped amendment '${slug}'.`);
  const active = getActive();
  if (active === slug) {
    clearActive();
    console.log("  (active cleared — on main now)");
  }
}
function cmdStatus() {
  ensureConfig();
  const active = getActive();
  if (!active) {
    console.log("on main — no open amendments.");
    const leavesDir = `${BASE_REPO}/leaves`;
    if (existsSync3(leavesDir)) {
      const dirty = run(`git -C "${BASE_REPO}" diff --quiet -- leaves/ 2>/dev/null || echo dirty`, { quiet: true }).stdout !== "" || run(`git -C "${BASE_REPO}" diff --cached --quiet -- leaves/ 2>/dev/null || echo dirty`, { quiet: true }).stdout !== "";
      if (dirty) {
        console.log("  (uncommitted edits in store/leaves/ — did you mean to amend?)");
      }
    }
    const remote2 = readConfig("remote");
    if (remote2 && mainExists()) {
      const behind = behindCount();
      if (behind > 0) {
        console.log(`  behind remote by ${behind} commit(s). Run 'folio sync'.`);
      }
    }
    return;
  }
  console.log(`amendment:    ${active}`);
  const path = amendmentPath(active);
  if (!worktreeExists(path)) {
    console.log(`  (worktree missing — run 'folio switch -c ${active}' to recreate)`);
    return;
  }
  const branch = amendmentBranch(path);
  console.log(`branch:       ${branch}`);
  if (isDirty(path)) {
    console.log("state:        dirty");
    const status = run(`git -C "${path}" status --short 2>/dev/null || true`, {
      quiet: true
    }).stdout;
    if (status) {
      for (const line of status.split(`
`).slice(0, 10)) {
        if (line)
          console.log(`  ${line}`);
      }
    }
  } else {
    console.log("state:        clean");
  }
  if (mainExists()) {
    const behind = behindCount();
    if (behind > 0) {
      console.log(`  behind main by ${behind} commit(s)`);
    }
  }
  const remote = readConfig("remote");
  if (remote && branch && branch !== "?") {
    const ghCheck = run("which gh 2>/dev/null", { quiet: true });
    if (ghCheck.exitCode === 0) {
      try {
        const prResult = gh(`pr list --head "${branch}" --state open --json number --jq '.[0].number'`);
        const prNum = prResult.stdout;
        if (prNum && prNum !== "null") {
          console.log(`pr:           https://github.com/${remote}/pull/${prNum}`);
        }
      } catch {}
    }
  }
}
function cmdConfig(args) {
  ensureConfig();
  const key = args[0];
  const value = args[1];
  if (!key) {
    const remote = readConfig("remote") || "(not set)";
    const active = readConfig("active") || "(not set)";
    const web = readConfig("web") || "(not set)";
    const store = readConfig("store") || "(not set)";
    console.log(`remote: ${remote}`);
    console.log(`store: ${store}`);
    console.log(`web: ${web}`);
    console.log(`active: ${active}`);
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
    console.log("No amendments. Run 'folio switch -c <topic>' to start one.");
    return;
  }
  for (const a of amendments) {
    const marker = a.topic === active ? "*" : " ";
    console.log(tableRow(marker, a.topic, a.status, a.pr || ""));
  }
}

// src/index.ts
function die(msg) {
  console.error(`folio: ${msg}`);
  process.exit(1);
}
function help() {
  console.log(`
folio \u2014 knowledge management CLI

Usage:
  folio bind <ns/repo> [--web]    Bind to a knowledge repo (one-time setup)
  folio switch                     List amendments (* = active)
  folio switch <topic>            Switch to an existing amendment
  folio switch -c <topic>          Create a new amendment (--force to re-create)
  folio status                     Show current state (main | amendment)
  folio sync [-m "msg"]            Pull main \u2192 rebase \u2192 commit \u2192 push \u2192 draft PR
  folio drop <topic> --force       Delete an amendment (local + remote)
  folio list                       List all amendments
  folio config                     Show global config
  folio config <key> <value>       Set config value
  folio web                        Open Folio Web or GitHub PR list for bound repo
  folio web --no-open              Print URL only

Edits go in ~/.config/folio/stores/amendments/<topic>/leaves/.
folio sync opens a draft PR; merge via folio web.
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
    case "switch":
      cmdSwitch(args);
      break;
    case "sync":
      cmdSync(args);
      break;
    case "drop":
      cmdDrop(args);
      break;
    case "list":
      cmdList();
      break;
    case "status":
      cmdStatus();
      break;
    case "config":
      cmdConfig(args);
      break;
    case "web":
      cmdWeb(args);
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
