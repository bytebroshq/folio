import { existsSync } from "node:fs";
import {
	AMEND_DIR,
	amendmentPath,
	BASE_REPO,
	type ConfigKey,
	clearActive,
	ensureConfig,
	getActive,
	getRemote,
	readConfig,
	setActive,
	topicToSlug,
	writeConfig,
} from "./config";
import {
	amendmentBranch,
	behindCount,
	ensureBase,
	ensureGh,
	fetchMain,
	gh,
	isDirty,
	listAmendments,
	listOpenPRs,
	mainExists,
	run,
	worktreeExists,
} from "./git";
import { lint, printLintResult } from "./lint";
import { openBrowser } from "./open";

// ── Formatting helpers ──────────────────────────────────────────────

function tableRow(
	marker: string,
	topic: string,
	status: string,
	pr: string,
): string {
	return `  ${marker}${topic.padEnd(35)} ${status.padEnd(7)} ${pr}`;
}

// ── bind ───────────────────────────────────────────────────────────

export function cmdBind(args: string[]): void {
	const remote = args[0];
	if (!remote) throw new Error("Usage: folio bind <ns/repo> [--web]");

	const hasWeb = args.includes("--web");

	const currentRemote = readConfig("remote");
	if (currentRemote === remote) {
		console.log(`Already bound to ${remote}.`);
		return;
	}

	if (currentRemote && currentRemote !== remote) {
		if (!args.includes("--force")) {
			throw new Error(
				`Currently bound to ${currentRemote}. All amendments will be lost. Use --force to re-bind.`,
			);
		}
	}

	// Auth check before any git work
	console.log(`Checking access to ${remote}...`);
	const authCheck = run(`git ls-remote git@github.com:${remote}.git HEAD`, {
		quiet: true,
	});
	if (authCheck.exitCode !== 0) {
		throw new Error(
			`Cannot access ${remote}. Check your SSH setup or repo URL. Run: gh auth status`,
		);
	}

	ensureConfig();

	// If base exists from a different remote, nuke it
	if (existsSync(`${BASE_REPO}/.git`)) {
		const existingUrl = run(
			`git -C "${BASE_REPO}" remote get-url origin 2>/dev/null || echo ""`,
			{ quiet: true },
		).stdout;
		if (existingUrl !== `git@github.com:${remote}.git`) {
			console.log("Old clone points to a different remote. Re-cloning...");
			run(`rm -rf "${BASE_REPO}"`);
		}
	}

	writeConfig("remote", remote);
	ensureBase(remote);

	// Fast-forward main checkout
	run(
		`git -C "${BASE_REPO}" checkout main --quiet 2>/dev/null || git -C "${BASE_REPO}" checkout origin/main --quiet`,
		{ quiet: true },
	);
	const ff = run(
		`git -C "${BASE_REPO}" pull --ff-only origin main --quiet 2>/dev/null || echo "(main behind remote — run 'folio sync' to catch up)"`,
		{ quiet: true },
	);
	if (ff.stdout) console.log(`  ${ff.stdout}`);

	console.log(`✓ Bound to ${remote}.`);

	// --web: open browser to web URL
	if (hasWeb) {
		cmdWeb([]);
	}
}

// ── switch ─────────────────────────────────────────────────────────

export function cmdSwitch(args: string[]): void {
	ensureConfig();
	ensureBase();

	if (args.length === 0) {
		// List amendments
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

	// Parse flags
	let create = false;
	let force = false;
	let topic = "";

	for (const arg of args) {
		if (arg === "-c" || arg === "--create") create = true;
		else if (arg === "--force") force = true;
		else topic = arg;
	}

	if (create && topic) {
		cmdSwitchCreate(topic, force);
	} else if (topic) {
		cmdSwitchTo(topic);
	} else {
		throw new Error("Usage: folio switch <topic> | folio switch -c <topic>");
	}
}

function cmdSwitchCreate(topic: string, force: boolean): void {
	const slug = topicToSlug(topic);
	const path = amendmentPath(slug);

	if (worktreeExists(path)) {
		const branch = amendmentBranch(path);
		// Check if merged to main
		const _remote = getRemote();
		fetchMain();
		const merged =
			run(
				`git -C "${BASE_REPO}" branch -r --merged origin/main 2>/dev/null | grep -q "origin/${branch}" && echo yes || echo no`,
				{ quiet: true },
			).stdout === "yes";

		if (merged) {
			if (force) {
				console.log(
					`Branch '${branch}' was merged. Deleting and creating fresh...`,
				);
				run(`git -C "${BASE_REPO}" branch -D "${branch}" 2>/dev/null || true`);
				run(`git push origin --delete "${branch}" 2>/dev/null || true`);
				run(`rm -rf "${path}"`);
			} else {
				throw new Error(
					`amendment '${slug}' exists and was merged. Use 'switch -c ${topic} --force' to restart.`,
				);
			}
		} else {
			// Open draft — rebase and switch
			console.log(`Rebasing ${slug} onto main...`);
			const rebase = run(
				`git -C "${path}" rebase origin/main --quiet 2>/dev/null`,
				{ quiet: true },
			);
			if (rebase.exitCode !== 0) {
				throw new Error(
					`Rebase conflict in ${slug}. Resolve in ${path}/ then re-run 'folio sync'.`,
				);
			}
			run(`git -C "${path}" pull --rebase --quiet 2>/dev/null || true`);
			setActive(slug);
			console.log(`✓ Switched to amendment '${slug}'.`);
			return;
		}
	}

	// Create new
	if (worktreeExists(path)) {
		throw new Error(`amendment '${slug}' already exists. Drop it first.`);
	}

	// Ensure main is fresh
	const remote = getRemote();
	ensureBase(remote);
	run(`git -C "${BASE_REPO}" checkout main --quiet 2>/dev/null || true`);
	run(
		`git -C "${BASE_REPO}" pull --ff-only origin main --quiet 2>/dev/null || true`,
	);

	const branch = `amend/${slug}`;
	console.log(`Creating amendment worktree for '${slug}'...`);
	const wt = run(
		`git -C "${BASE_REPO}" worktree add -b "${branch}" "${path}" origin/main --quiet 2>/dev/null`,
	);
	if (wt.exitCode !== 0) {
		throw new Error(`Failed to create worktree for '${slug}'.`);
	}

	setActive(slug);
	console.log(`✓ Amendment '${slug}' created.`);
	console.log(`  store: ${path}/`);
}

function cmdSwitchTo(topic: string): void {
	const slug = topicToSlug(topic);
	const path = amendmentPath(slug);

	if (!worktreeExists(path)) {
		throw new Error(
			`amendment '${slug}' not found. Use 'folio switch -c ${topic}' to create one.`,
		);
	}

	const branch = amendmentBranch(path);
	const _remote = getRemote();
	fetchMain();

	// Check if merged
	const merged =
		run(
			`git -C "${BASE_REPO}" branch -r --merged origin/main 2>/dev/null | grep -q "origin/${branch}" && echo yes || echo no`,
			{ quiet: true },
		).stdout === "yes";

	if (merged) {
		throw new Error(
			`amendment '${slug}' was merged. Use 'switch -c ${topic} --force' to restart.`,
		);
	}

	// Rebase
	console.log(`Rebasing ${slug} onto main...`);
	const rebase = run(
		`git -C "${path}" rebase origin/main --quiet 2>/dev/null`,
		{ quiet: true },
	);
	if (rebase.exitCode !== 0) {
		throw new Error(
			`Rebase conflict in ${slug}. Resolve in ${path}/ then re-run 'folio sync'.`,
		);
	}

	setActive(slug);
	console.log(`✓ Switched to amendment '${slug}'.`);
}

// ── sync ───────────────────────────────────────────────────────────

export function cmdSync(args: string[]): void {
	ensureGh();
	ensureConfig();

	const remote = getRemote();
	ensureBase(remote);

	// Always surface open PRs first
	const prs = listOpenPRs(remote);
	if (prs.length > 0) {
		console.log("Open PRs:");
		for (const prLine of prs) {
			if (prLine) console.log(`  ${prLine}`);
		}
		console.log("");
	}

	const active = getActive();

	if (!active) {
		// on main mode
		console.log(`Pulling latest from ${remote}...`);
		const pull = run(
			`git -C "${BASE_REPO}" pull --ff-only origin main --quiet 2>/dev/null`,
		);
		if (pull.exitCode !== 0) {
			throw new Error("Failed to pull main. Check network.");
		}

		// Check for uncommitted changes
		const hasChanges =
			run(
				`git -C "${BASE_REPO}" diff --quiet -- '*.md' 2>/dev/null || echo dirty`,
				{ quiet: true },
			).stdout !== "" ||
			run(
				`git -C "${BASE_REPO}" diff --cached --quiet -- '*.md' 2>/dev/null || echo dirty`,
				{ quiet: true },
			).stdout !== "";
		if (hasChanges) {
			console.log("  (uncommitted edits in store — did you mean to amend?)");
		}

		console.log("✓ on main, synced.");
		return;
	}

	// In amendment mode
	const path = amendmentPath(active);
	if (!worktreeExists(path)) {
		throw new Error(
			`Worktree for '${active}' not found. Run 'folio switch -c ${active}'.`,
		);
	}

	const branch = amendmentBranch(path);
	if (!branch || branch === "?") {
		throw new Error(`Amendment '${active}' is not on a branch.`);
	}

	// Resolve -m flag
	let msg = `amend: ${active}`;
	const mIdx = args.indexOf("-m");
	if (mIdx >= 0 && mIdx + 1 < args.length) {
		msg = args[mIdx + 1];
	}

	// Check if anything to commit
	const hasChanges =
		run(`git -C "${path}" diff --quiet 2>/dev/null || echo dirty`, {
			quiet: true,
		}).stdout !== "" ||
		run(`git -C "${path}" diff --cached --quiet 2>/dev/null || echo dirty`, {
			quiet: true,
		}).stdout !== "" ||
		run(`git -C "${path}" ls-files --others --exclude-standard 2>/dev/null`, {
			quiet: true,
		}).stdout !== "";

	// Commit first (if dirty)
	if (hasChanges) {
		run(`git -C "${path}" add -A`);
		const commit = run(
			`git -C "${path}" commit -m "${msg.replace(/"/g, '\\"')}" --quiet`,
		);
		if (commit.exitCode !== 0) {
			throw new Error(`Commit failed: ${commit.stderr}`);
		}
		console.log(`Committed: ${msg}`);
	}

	// Rebase
	console.log(`Rebasing '${branch}' onto main...`);
	const rebase = run(`git -C "${path}" rebase origin/main --quiet 2>/dev/null`);
	if (rebase.exitCode !== 0) {
		throw new Error(
			`REBASE CONFLICT in ${active} — resolve in ${path}/ then re-run 'folio sync'.`,
		);
	}

	if (!hasChanges) {
		// Check if push is needed
		const localSha = run(`git -C "${path}" rev-parse HEAD 2>/dev/null`, {
			quiet: true,
		}).stdout;
		const remoteSha = run(
			`git -C "${path}" rev-parse "origin/${branch}" 2>/dev/null || echo ""`,
			{ quiet: true },
		).stdout;
		if (localSha && remoteSha && localSha === remoteSha) {
			console.log(`Everything up to date in '${active}'.`);
			return;
		}
	}

	// Force-push
	const push = run(
		`git -C "${path}" push --force origin "${branch}" --quiet 2>&1`,
	);
	if (push.exitCode !== 0) {
		throw new Error("Push failed. Check network and access.");
	}

	// Create or update draft PR
	const prNum = gh(
		`pr list --head "${branch}" --state open --json number --jq '.[0].number'`,
		remote,
	).stdout;

	if (!prNum || prNum === "null") {
		const prTitle = msg.split("\n")[0];
		const prResult = run(
			`gh pr create --repo "${remote}" --base main --head "${branch}" --draft --title "${prTitle.replace(/"/g, '\\"')}" --body "${msg.replace(/"/g, '\\"')}"`,
			{ quiet: true },
		);
		if (prResult.exitCode !== 0) {
			throw new Error(`PR creation failed: ${prResult.stderr}`);
		}
		const newPrNum = prResult.stdout.match(/(\d+)$/)?.[0] || "?";
		console.log(`✓ Draft PR #${newPrNum} created`);
		console.log(`  https://github.com/${remote}/pull/${newPrNum}`);
	} else {
		if (hasChanges) {
			run(
				`gh pr edit --repo "${remote}" ${prNum} --title "${msg.split("\n")[0].replace(/"/g, '\\"')}" --body "${msg.replace(/"/g, '\\"')}" 2>/dev/null || true`,
				{ quiet: true },
			);
		}
		console.log(`✓ Draft PR #${prNum} updated`);
		console.log(`  https://github.com/${remote}/pull/${prNum}`);
	}
}

// ── drop ───────────────────────────────────────────────────────────

export function cmdDrop(args: string[]): void {
	let topic = "";
	let force = false;

	for (const arg of args) {
		if (arg === "--force") force = true;
		else topic = arg;
	}

	if (!topic) throw new Error("Usage: folio drop <topic> [--force]");

	const slug = topicToSlug(topic);
	const path = amendmentPath(slug);

	if (!worktreeExists(path)) {
		throw new Error(`Amendment '${slug}' not found.`);
	}

	const branch = amendmentBranch(path);
	const remote = getRemote();

	// Check for open PR
	let prNum = "";
	if (branch && branch !== "?") {
		const prResult = gh(
			`pr list --head "${branch}" --state open --json number --jq '.[0].number'`,
			remote,
		);
		if (prResult.stdout && prResult.stdout !== "null") {
			prNum = prResult.stdout;
		}
	}

	const dirty = isDirty(path);

	// Warning
	if (prNum) {
		if (dirty) {
			console.log(
				`  amendment '${slug}' has an open draft PR (#${prNum}) and uncommitted changes.`,
			);
		} else {
			console.log(`  amendment '${slug}' has an open draft PR (#${prNum}).`);
		}
		console.log(
			"  --force will close the PR, delete the remote branch, and remove local worktree.",
		);
	} else if (dirty) {
		console.log(
			`  amendment '${slug}' has uncommitted changes. --force discards them.`,
		);
	} else {
		console.log(`  amendment '${slug}' is clean.`);
	}

	if (!force) {
		throw new Error("Use --force to confirm deletion.");
	}

	// Close PR if open
	if (prNum) {
		run(`gh pr close --repo "${remote}" "${prNum}" 2>/dev/null || true`);
		console.log(`  Closed PR #${prNum}.`);
	}

	// Delete remote branch
	if (branch && branch !== "?") {
		run(`git push origin --delete "${branch}" 2>/dev/null || true`);
		console.log(`  Deleted remote branch '${branch}'.`);
	}

	// Remove worktree
	run(
		`git -C "${BASE_REPO}" worktree remove "${path}" --force 2>/dev/null || rm -rf "${path}"`,
	);
	console.log(`✓ Dropped amendment '${slug}'.`);

	// Clear active if this was active
	const active = getActive();
	if (active === slug) {
		clearActive();
		console.log("  (active cleared — on main now)");
	}
}

// ── status ─────────────────────────────────────────────────────────

export function cmdStatus(): void {
	ensureConfig();

	const remote = readConfig("remote");
	if (!remote) {
		console.log("No repo bound. Run 'folio bind <ns/repo>' to get started.");
		return;
	}

	const active = getActive();

	if (!active) {
		console.log("on main — no open amendments.");

		// Check if main checkout Markdown content is dirty
		const dirty =
			run(
				`git -C "${BASE_REPO}" diff --quiet -- '*.md' 2>/dev/null || echo dirty`,
				{ quiet: true },
			).stdout !== "" ||
			run(
				`git -C "${BASE_REPO}" diff --cached --quiet -- '*.md' 2>/dev/null || echo dirty`,
				{ quiet: true },
			).stdout !== "";
		if (dirty) {
			console.log("  (uncommitted edits in store — did you mean to amend?)");
		}

		const remoteBound = readConfig("remote");
		if (remoteBound && mainExists()) {
			const behind = behindCount();
			if (behind > 0) {
				console.log(
					`  behind remote by ${behind} commit(s). Run 'folio sync'.`,
				);
			}
		}
		return;
	}

	// In an amendment
	console.log(`amendment:    ${active}`);
	const path = amendmentPath(active);

	if (!worktreeExists(path)) {
		console.log(
			`  (worktree missing — run 'folio switch -c ${active}' to recreate)`,
		);
		return;
	}

	const branch = amendmentBranch(path);
	console.log(`branch:       ${branch}`);

	if (isDirty(path)) {
		console.log("state:        dirty");
		const status = run(`git -C "${path}" status --short 2>/dev/null || true`, {
			quiet: true,
		}).stdout;
		if (status) {
			for (const line of status.split("\n").slice(0, 10)) {
				if (line) console.log(`  ${line}`);
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

	// PR
	if (remote && branch && branch !== "?") {
		const ghCheck = run("which gh 2>/dev/null", { quiet: true });
		if (ghCheck.exitCode === 0) {
			try {
				const prResult = gh(
					`pr list --head "${branch}" --state open --json number --jq '.[0].number'`,
				);
				const prNum = prResult.stdout;
				if (prNum && prNum !== "null") {
					console.log(
						`pr:           https://github.com/${remote}/pull/${prNum}`,
					);
				}
			} catch {
				// gh not available or other error
			}
		}
	}
}

// ── config command ────────────────────────────────────────────────

export function cmdConfig(args: string[]): void {
	ensureConfig();

	const key = args[0] as string | undefined;
	const value = args[1] as string | undefined;

	if (!key) {
		// Show all config
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
		// Read single key
		const val = readConfig(key as ConfigKey);
		console.log(val || "");
		return;
	}

	// Write key-value
	writeConfig(key as ConfigKey, value);
}

// ── web ────────────────────────────────────────────────────────────

export function cmdWeb(args: string[]): void {
	ensureConfig();

	const noOpen = args.includes("--no-open");
	const printUrl = args.includes("--print-url");

	const remote = readConfig("remote");
	if (!remote) {
		throw new Error("No remote configured. Run 'folio bind <ns/repo>' first.");
	}

	const webUrl = readConfig("web") || "";

	// Determine target URL
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

// ── list ───────────────────────────────────────────────────────────

export function cmdList(): void {
	ensureConfig();
	if (mainExists()) ensureBase();

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

// ── lint ───────────────────────────────────────────────────────────

export function cmdLint(args: string[]): void {
	ensureConfig();

	const json = args.includes("--json");
	const strict = args.includes("--strict");

	const active = getActive();
	let storeDir: string;

	if (active && existsSync(`${AMEND_DIR}/${active}`)) {
		storeDir = `${AMEND_DIR}/${active}`;
	} else if (mainExists()) {
		storeDir = BASE_REPO;
	} else {
		throw new Error("No store found. Run 'folio bind <ns/repo>' first.");
	}

	const result = lint(storeDir);

	if (json) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		printLintResult(result);
	}

	if (strict && result.issues.length > 0) {
		process.exit(1);
	}
}
