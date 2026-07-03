import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { hasLintErrors, lint, printLintResult } from "@folio/core";
import {
	AMEND_DIR,
	amendmentPath,
	BASE_REPO,
	baseRepo,
	type ConfigKey,
	clearActive,
	ensureConfig,
	getActive,
	getRemote,
	getSource,
	isLocal,
	readConfig,
	resolvePath,
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
	isMergedToMain,
	listAmendments,
	mainExists,
	mainRef,
	run,
	worktreeExists,
} from "./git";
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

function printStatusFooter(bound: string, path: string): void {
	console.log("");
	if (bound === path) {
		console.log(`Bound to ${bound}`);
		return;
	}
	console.log(`Bound to ${bound} · ${path}`);
}

// ── bind ───────────────────────────────────────────────────────────

/** A bind target is local when it points at the filesystem, not ns/repo. */
function isLocalTarget(target: string): boolean {
	if (/^(\/|~\/|~$|\.\/|\.\.\/|\.$|\.\.$)/.test(target)) return true;
	return existsSync(resolvePath(target));
}

function currentBinding(): string | null {
	return getSource() ?? readConfig("remote");
}

/** Guard against silently discarding an existing binding's amendments. */
function checkRebind(target: string, force: boolean): boolean {
	const current = currentBinding();
	if (current === target) {
		console.log(`Already bound to ${target}.`);
		return false;
	}
	if (current && !force) {
		throw new Error(
			`Currently bound to ${current}. All amendments will be lost. Use --force to re-bind.`,
		);
	}
	return true;
}

function bindLocal(path: string, force: boolean): void {
	const abs = resolvePath(path);

	if (!checkRebind(abs, force)) return;

	if (!existsSync(abs)) {
		throw new Error(`No such directory: ${abs}. Run 'folio create ${path}'?`);
	}
	if (!existsSync(`${abs}/.git`)) {
		throw new Error(
			`${abs} is not a git repository. Run 'git init -b main' there or 'folio create <path>'.`,
		);
	}
	const hasMain =
		run(`git -C "${abs}" rev-parse --verify main 2>/dev/null`, {
			quiet: true,
		}).exitCode === 0;
	if (!hasMain) {
		throw new Error(
			`${abs} has no 'main' branch. Folio uses main as published truth.`,
		);
	}

	ensureConfig();
	writeConfig("source", abs);
	writeConfig("remote", "");
	clearActive();
	ensureBase();

	console.log(`✓ Bound to ${abs} (local).`);
}

export function cmdBind(args: string[]): void {
	const remote = args[0];
	if (!remote) throw new Error("Usage: folio bind <ns/repo | path> [--web]");

	const hasWeb = args.includes("--web");

	if (isLocalTarget(remote)) {
		bindLocal(remote, args.includes("--force"));
		return;
	}

	if (!checkRebind(remote, args.includes("--force"))) return;

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
	writeConfig("source", "");
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

// ── create ─────────────────────────────────────────────────────────

const INDEX_SCAFFOLD = `# Index

Map of this folio. List leaves under useful headings with bracket links to
each leaf and a short description of what it holds.
`;

const SCHEMA_SCAFFOLD = `# SCHEMA

Local conventions for this folio.

## Naming

- kebab-case filenames
- namespace prefixes for grouping, e.g. project-, patterns-

## Links

- bracket links between leaves, resolved by filename without the .md extension
- keep leaves listed in INDEX.md
`;

export function cmdCreate(args: string[]): void {
	const target = args.find((a) => !a.startsWith("--"));
	if (!target) throw new Error("Usage: folio create <path> [--force]");

	const abs = resolvePath(target);

	if (existsSync(abs) && readdirSync(abs).length > 0) {
		throw new Error(`${abs} already exists and is not empty.`);
	}

	mkdirSync(abs, { recursive: true });
	writeFileSync(`${abs}/INDEX.md`, INDEX_SCAFFOLD, "utf-8");
	writeFileSync(`${abs}/SCHEMA.md`, SCHEMA_SCAFFOLD, "utf-8");

	const init = run(
		`git -C "${abs}" init -b main --quiet && git -C "${abs}" add -A && git -C "${abs}" commit -m "folio: scaffold INDEX and SCHEMA" --quiet`,
	);
	if (init.exitCode !== 0) {
		throw new Error(`git init failed in ${abs}: ${init.stderr}`);
	}

	console.log(`✓ Created folio at ${abs}`);
	console.log("  INDEX.md, SCHEMA.md");
	console.log("  git init, initial commit");

	bindLocal(abs, args.includes("--force"));
}

// ── draft ──────────────────────────────────────────────────────────

/** Create a new draft, or resume an existing one. Idempotent. */
export function cmdDraft(args: string[]): void {
	ensureConfig();
	ensureBase();

	let force = false;
	let topic = "";
	for (const arg of args) {
		if (arg === "--force") force = true;
		else topic = arg;
	}

	if (!topic) {
		throw new Error("Usage: folio draft <topic> [--force]");
	}

	const slug = topicToSlug(topic);
	const path = amendmentPath(slug);

	if (worktreeExists(path)) {
		const branch = amendmentBranch(path);
		const merged = isMergedToMain(branch);

		if (merged) {
			if (force) {
				console.log(
					`Draft '${branch}' was already published. Deleting and starting fresh...`,
				);
				run(`git -C "${baseRepo()}" branch -D "${branch}" 2>/dev/null || true`);
				if (!isLocal()) {
					run(`git push origin --delete "${branch}" 2>/dev/null || true`);
				}
				run(`rm -rf "${path}"`);
			} else {
				throw new Error(
					`draft '${slug}' was already published. Use 'draft ${topic} --force' to restart.`,
				);
			}
		} else {
			// Open draft — resume it
			console.log(`Rebasing ${slug} onto main...`);
			const rebase = run(
				`git -C "${path}" rebase ${mainRef()} --quiet 2>/dev/null`,
				{ quiet: true },
			);
			if (rebase.exitCode !== 0) {
				throw new Error(
					`Rebase conflict in ${slug}. Resolve in ${path}/ then re-run 'folio proof'.`,
				);
			}
			if (!isLocal()) {
				run(`git -C "${path}" pull --rebase --quiet 2>/dev/null || true`);
			}
			setActive(slug);
			console.log(`✓ Resumed draft '${slug}'.`);
			return;
		}
	}

	// Create new
	if (worktreeExists(path)) {
		throw new Error(`draft '${slug}' already exists. Drop it first.`);
	}

	// Ensure main is fresh
	ensureBase();
	if (!isLocal()) {
		run(`git -C "${BASE_REPO}" checkout main --quiet 2>/dev/null || true`);
		run(
			`git -C "${BASE_REPO}" pull --ff-only origin main --quiet 2>/dev/null || true`,
		);
	}

	const branch = `amend/${slug}`;
	console.log(`Creating draft worktree for '${slug}'...`);
	const wt = run(
		`git -C "${baseRepo()}" worktree add -b "${branch}" "${path}" ${mainRef()} --quiet 2>/dev/null`,
	);
	if (wt.exitCode !== 0) {
		throw new Error(`Failed to create worktree for '${slug}'.`);
	}

	setActive(slug);
	console.log(`✓ Draft '${slug}' created.`);
	console.log(`  store: ${path}/`);
}

// ── shared draft helpers ─────────────────────────────────────────────

function requireActiveDraft(verb: string): { active: string; path: string } {
	const active = getActive();
	if (!active) {
		throw new Error(
			`No active draft. Run 'folio draft <topic>' before '${verb}'.`,
		);
	}
	const path = amendmentPath(active);
	if (!worktreeExists(path)) {
		throw new Error(
			`Worktree for '${active}' not found. Run 'folio draft ${active}'.`,
		);
	}
	return { active, path };
}

function draftHasChanges(path: string): boolean {
	return (
		run(`git -C "${path}" diff --quiet 2>/dev/null || echo dirty`, {
			quiet: true,
		}).stdout !== "" ||
		run(`git -C "${path}" diff --cached --quiet 2>/dev/null || echo dirty`, {
			quiet: true,
		}).stdout !== "" ||
		run(`git -C "${path}" ls-files --others --exclude-standard 2>/dev/null`, {
			quiet: true,
		}).stdout !== ""
	);
}

/** Look up the open PR number for a branch, if any. Empty string if none. */
function findOpenPR(remote: string, branch: string): string {
	const prNum = gh(
		`pr list --head "${branch}" --state open --json number --jq '.[0].number'`,
		remote,
	).stdout;
	return prNum && prNum !== "null" ? prNum : "";
}

// ── save ───────────────────────────────────────────────────────────

export function cmdSave(args: string[]): void {
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
	const commit = run(
		`git -C "${path}" commit -m "${msg.replace(/"/g, '\\"')}" --quiet`,
	);
	if (commit.exitCode !== 0) {
		throw new Error(`Save failed: ${commit.stderr}`);
	}
	console.log(`Saved: ${msg}`);
}

// ── proof ──────────────────────────────────────────────────────────

export function cmdProof(args: string[]): void {
	ensureConfig();
	const local = isLocal();
	const remote = local ? "" : getRemote();
	if (!local) ensureGh();

	const { active, path } = requireActiveDraft("proof");
	const branch = amendmentBranch(path);
	if (!branch || branch === "?") {
		throw new Error(`Draft '${active}' is not on a branch.`);
	}

	// Auto-save so proof always reviews the latest edits.
	if (draftHasChanges(path)) {
		cmdSave(args);
	}

	// Lint before rebase/publish — proof is the mechanical gate.
	const lintResult = lint(path, { spec: "folio" });
	printLintResult(lintResult);
	if (hasLintErrors(lintResult)) {
		throw new Error(
			`Lint found issues in '${active}'. Fix them, 'folio save', then re-run 'folio proof'.`,
		);
	}

	console.log(`Rebasing '${branch}' onto main...`);
	const rebase = run(
		`git -C "${path}" rebase ${mainRef()} --quiet 2>/dev/null`,
	);
	if (rebase.exitCode !== 0) {
		throw new Error(
			`REBASE CONFLICT in ${active} — resolve in ${path}/ then re-run 'folio proof'.`,
		);
	}

	if (local) {
		const diffStat = run(
			`git -C "${path}" diff ${mainRef()}...HEAD --stat 2>/dev/null`,
			{ quiet: true },
		).stdout;
		console.log(`✓ Proofed '${active}' — changes vs main:`);
		console.log(diffStat || "  (no changes)");
		console.log("Run 'folio publish' when ready.");
		return;
	}

	// Force-push and create/update the draft PR.
	const push = run(
		`git -C "${path}" push --force origin "${branch}" --quiet 2>&1`,
	);
	if (push.exitCode !== 0) {
		throw new Error("Push failed. Check network and access.");
	}

	const prNum = findOpenPR(remote, branch);
	const msg = run(`git -C "${path}" log -1 --format=%B`, {
		quiet: true,
	}).stdout;
	const title = (msg.split("\n")[0] || `amend: ${active}`).replace(/"/g, '\\"');

	if (!prNum) {
		const prResult = run(
			`gh pr create --repo "${remote}" --base main --head "${branch}" --draft --title "${title}" --body "${msg.replace(/"/g, '\\"')}"`,
			{ quiet: true },
		);
		if (prResult.exitCode !== 0) {
			throw new Error(`PR creation failed: ${prResult.stderr}`);
		}
		const newPrNum = prResult.stdout.match(/(\d+)$/)?.[0] || "?";
		console.log(`✓ Proofed '${active}' — draft PR #${newPrNum} opened`);
		console.log(`  https://github.com/${remote}/pull/${newPrNum}`);
	} else {
		run(
			`gh pr edit --repo "${remote}" ${prNum} --title "${title}" --body "${msg.replace(/"/g, '\\"')}" 2>/dev/null || true`,
			{ quiet: true },
		);
		console.log(`✓ Proofed '${active}' — draft PR #${prNum} updated`);
		console.log(`  https://github.com/${remote}/pull/${prNum}`);
	}
	console.log(
		"  Review on GitHub and mark it ready, then run 'folio publish'.",
	);
}

// ── publish ────────────────────────────────────────────────────────

function cleanupDraft(active: string, path: string, branch: string): void {
	run(
		`git -C "${baseRepo()}" worktree remove "${path}" --force 2>/dev/null || rm -rf "${path}"`,
	);
	run(`git -C "${baseRepo()}" branch -D "${branch}" 2>/dev/null || true`);
	clearActive();
	console.log(`  Draft '${active}' closed.`);
}

export function cmdPublish(_args: string[]): void {
	ensureConfig();
	const local = isLocal();
	const remote = local ? "" : getRemote();
	if (!local) ensureGh();

	const { active, path } = requireActiveDraft("publish");
	const branch = amendmentBranch(path);
	if (!branch || branch === "?") {
		throw new Error(`Draft '${active}' is not on a branch.`);
	}

	if (draftHasChanges(path)) {
		throw new Error(
			`Draft '${active}' has unsaved changes. Run 'folio save' then 'folio proof' first.`,
		);
	}

	if (local) {
		const merge = run(
			`git -C "${baseRepo()}" merge "${branch}" --no-edit --quiet 2>&1`,
		);
		if (merge.exitCode !== 0) {
			throw new Error(`Merge failed: ${merge.stderr || merge.stdout}`);
		}
		console.log(`✓ Published '${active}' into main.`);
		cleanupDraft(active, path, branch);
		return;
	}

	const prNum = findOpenPR(remote, branch);
	if (!prNum) {
		throw new Error(
			`No open PR for '${active}'. Run 'folio proof' first to send it for review.`,
		);
	}

	const isDraft = gh(
		`pr view ${prNum} --json isDraft --jq .isDraft`,
		remote,
	).stdout;
	if (isDraft === "true") {
		console.log(
			`PR #${prNum} is still a draft — review it on GitHub and mark it ready, then run 'folio publish'.`,
		);
		return;
	}

	const merge = run(
		`gh pr merge --repo "${remote}" ${prNum} --squash --delete-branch 2>&1`,
	);
	if (merge.exitCode !== 0) {
		throw new Error(`Merge failed: ${merge.stderr || merge.stdout}`);
	}
	console.log(`✓ Published '${active}' — PR #${prNum} merged.`);
	cleanupDraft(active, path, branch);
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
	const local = isLocal();
	const remote = local ? "" : getRemote();

	// Check for open PR
	let prNum = "";
	if (!local && branch && branch !== "?") {
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
	if (!local && branch && branch !== "?") {
		run(`git push origin --delete "${branch}" 2>/dev/null || true`);
		console.log(`  Deleted remote branch '${branch}'.`);
	}

	// Remove worktree
	run(
		`git -C "${baseRepo()}" worktree remove "${path}" --force 2>/dev/null || rm -rf "${path}"`,
	);

	// Local mode keeps branches in the bound repo — clean up the amend branch
	// unless it was merged (drop --force may discard unmerged work by design).
	if (local && branch && branch !== "?") {
		run(`git -C "${baseRepo()}" branch -D "${branch}" 2>/dev/null || true`);
	}
	console.log(`✓ Dropped amendment '${slug}'.`);

	// Clear active if this was active
	const active = getActive();
	if (active === slug) {
		clearActive();
		console.log("  (active cleared — on main now)");
	}
}

// ── status ─────────────────────────────────────────────────────────

/** `folio status` fetches in pr strategy so update guidance is fresh. */
export function cmdStatus(args: string[] = []): void {
	ensureConfig();

	const remote = readConfig("remote");
	const source = getSource();
	if (!remote && !source) {
		console.log(
			"No repo bound. Run 'folio bind <ns/repo | path>' or 'folio create <path>'.",
		);
		return;
	}

	const local = isLocal();
	const extended =
		args.includes("-x") ||
		args.includes("--extended") ||
		args.includes("-f") ||
		args.includes("--full");
	const update = args.includes("-u") || args.includes("--update");
	const bound = source ?? (remote as string);

	let fetchFailed = false;
	if (!local) {
		const before = run(
			`git -C "${BASE_REPO}" rev-parse origin/main 2>/dev/null`,
			{ quiet: true },
		).stdout;
		fetchMain();
		const after = run(
			`git -C "${BASE_REPO}" rev-parse origin/main 2>/dev/null`,
			{ quiet: true },
		).stdout;
		fetchFailed = before === "" && after === "";
	}
	const staleNote = fetchFailed
		? " (couldn't reach remote — showing cached state)"
		: "";

	const active = getActive();

	if (!active) {
		const path = baseRepo();
		console.log("No drafts");

		const dirty =
			run(`git -C "${path}" diff --quiet -- '*.md' 2>/dev/null || echo dirty`, {
				quiet: true,
			}).stdout !== "" ||
			run(
				`git -C "${path}" diff --cached --quiet -- '*.md' 2>/dev/null || echo dirty`,
				{ quiet: true },
			).stdout !== "";

		if (dirty) {
			console.log("Main has unsaved changes");
		} else {
			const behind = mainExists() ? behindCount() : 0;
			if (behind > 0) {
				if (update) {
					const pull = run(
						`git -C "${BASE_REPO}" pull --ff-only origin main --quiet 2>&1`,
					);
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

		printStatusFooter(bound, path);

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
	const hasCommits =
		run(`git -C "${path}" rev-list --count ${mainRef()}..HEAD 2>/dev/null`, {
			quiet: true,
		}).stdout !== "0";

	console.log(`On draft ${active}`);
	if (isDirty(path)) {
		console.log("Pending save, run `folio save`");
	} else if (!hasCommits) {
		console.log("No changes yet");
	} else if (extended && !local && branch && branch !== "?") {
		const prNum = findOpenPR(remote as string, branch);
		if (!prNum) {
			console.log("Saved, run `folio proof`");
		} else {
			const isDraftPR = gh(
				`pr view ${prNum} --json isDraft --jq .isDraft`,
				remote as string,
			).stdout;
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

// ── config command ────────────────────────────────────────────────

export function cmdConfig(args: string[]): void {
	ensureConfig();

	const key = args[0] as string | undefined;
	const value = args[1] as string | undefined;

	if (!key) {
		// Show all config
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
		// Resolved paths (computed, not stored)
		console.log(`path: ${bound ? baseRepo() : "(not bound)"}`);
		console.log(`amendments: ${AMEND_DIR}`);
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
		if (isLocal()) {
			throw new Error(
				"Bound to a local repo — folio web needs a GitHub remote. Run 'folio bind <ns/repo>'.",
			);
		}
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
		console.log("No amendments. Run 'folio draft <topic>' to start one.");
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
	const specIdx = args.indexOf("--spec");
	const spec = specIdx >= 0 ? args[specIdx + 1] : "folio";
	if (specIdx >= 0 && !spec) {
		throw new Error("Usage: folio lint [--spec folio] [--json] [--strict]");
	}

	const active = getActive();
	let storeDir: string;

	if (active && existsSync(`${AMEND_DIR}/${active}`)) {
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
