import {
	existsSync,
	mkdirSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { hasLintErrors, lint, printLintResult } from "@folio/core";
import {
	AMEND_DIR,
	amendmentPath,
	BASE_REPO,
	baseRepo,
	type ConfigKey,
	ensureConfig,
	getPath,
	getRemote,
	getStrategy,
	hasRemote,
	readConfig,
	resolvePath,
	STORE_DIR,
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
	listOpenPRMap,
	mainExists,
	mainRef,
	parseGitHubOrigin,
	run,
	worktreeExists,
} from "./git";
import { openBrowser } from "./open";
import { skillBundle } from "./skill-bundle.gen";
import {
	extractScent,
	readIndexDescription,
	readSkillDescription,
	restampSkillFile,
} from "./skill-scent";

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

const REPO_SHAPE = /^[\w.-]+\/[\w.-]+$/;

/**
 * Decide how a single bind positional is interpreted: an existing directory
 * (or path-marked target) binds a local repo in place; anything else is
 * treated as a GitHub owner/repo. --remote / --local override this.
 */
function resolveBindTarget(target: string): "local" | "remote" {
	if (/^(\/|~\/|~$|\.\/|\.\.\/|\.$|\.\.$)/.test(target)) return "local";
	return existsSync(resolvePath(target)) ? "local" : "remote";
}

/** A binding is the (remote, path) pair — either half may be unset. */
type Binding = { remote: string | null; path: string | null };

function currentBinding(): Binding {
	return { remote: readConfig("remote"), path: getPath() };
}

function describeBinding(b: Binding): string {
	if (b.remote && b.path) return `${b.remote} · ${b.path}`;
	return b.remote ?? b.path ?? "(none)";
}

/** Guard against silently discarding an existing binding's amendments. */
function checkRebind(next: Binding, force: boolean): boolean {
	const current = currentBinding();
	if (!current.remote && !current.path) return true;
	if (current.remote === next.remote && current.path === next.path) {
		console.log(`Already bound to ${describeBinding(current)}.`);
		return false;
	}
	if (!force) {
		throw new Error(
			`Currently bound to ${describeBinding(current)}. All amendments will be lost. Use --force to re-bind.`,
		);
	}
	return true;
}

/**
 * Detach from the current binding: drop amendment worktrees. Never touches
 * the bound directory itself — a custom path is the user's checkout; only
 * the managed clone is folio-owned.
 */
function detachCurrent(): void {
	const old = baseRepo();
	if (existsSync(AMEND_DIR)) {
		for (const entry of readdirSync(AMEND_DIR)) {
			run(`rm -rf "${AMEND_DIR}/${entry}"`);
		}
	}
	if (existsSync(`${old}/.git`)) {
		run(`git -C "${old}" worktree prune 2>/dev/null || true`, { quiet: true });
	}
}

/**
 * After a successful bind, refresh the installed skill's scent from the
 * newly bound block's INDEX — only if a skill was ever installed (the
 * `skill` config key is set) and its SKILL.md still exists there. Never
 * fails the bind: any error is swallowed with a warning at most.
 */
function restampBoundSkill(): void {
	const skillDir = readConfig("skill");
	if (!skillDir) return;

	const skillPath = join(skillDir, "SKILL.md");
	if (!existsSync(skillPath)) return;

	try {
		restampSkillFile(skillPath, baseRepo());
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.log(`  (couldn't refresh skill description: ${msg})`);
	}
}

function bindLocal(path: string, force: boolean): void {
	const abs = resolvePath(path);

	if (!checkRebind({ remote: null, path: abs }, force)) return;

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
	detachCurrent();
	writeConfig("path", abs);
	writeConfig("strategy", "merge");
	writeConfig("remote", "");
	ensureBase();

	console.log(`✓ Bound to ${abs} (local).`);

	// Promotion nudge: a GitHub origin can review via draft PRs instead.
	const origin = parseGitHubOrigin(abs);
	if (origin) {
		console.log(
			`  origin is github.com/${origin} — 'folio config strategy pr' to review via draft PRs.`,
		);
	}

	restampBoundSkill();
}

/** Verify SSH access to a GitHub repo before any state changes. */
function checkRemoteAccess(remote: string): void {
	console.log(`Checking access to ${remote}...`);
	const authCheck = run(`git ls-remote git@github.com:${remote}.git HEAD`, {
		quiet: true,
	});
	if (authCheck.exitCode !== 0) {
		throw new Error(
			`Cannot access ${remote}. Check your SSH setup or repo URL. Run: gh auth status`,
		);
	}
}

/** Bind a GitHub remote with its checkout at the managed default path. */
function bindRemote(remote: string, force: boolean): void {
	if (!checkRebind({ remote, path: null }, force)) return;

	checkRemoteAccess(remote);
	ensureConfig();

	// If base exists from a different remote, nuke it (folio-owned clone).
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

	detachCurrent();
	writeConfig("remote", remote);
	writeConfig("strategy", "pr");
	writeConfig("path", "");
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
	restampBoundSkill();
}

/** Bind a GitHub remote, cloning the checkout into a user-chosen path. */
function bindRemoteInto(remote: string, path: string, force: boolean): void {
	if (!REPO_SHAPE.test(remote) || existsSync(resolvePath(remote))) {
		throw new Error(
			`'${remote}' doesn't look like <owner/repo>. Usage: folio bind <owner/repo> <path>`,
		);
	}

	const abs = resolvePath(path);
	if (!checkRebind({ remote, path: abs }, force)) return;

	if (existsSync(abs) && readdirSync(abs).length > 0) {
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
		quiet: true,
	});

	detachCurrent();
	writeConfig("remote", remote);
	writeConfig("path", abs);
	writeConfig("strategy", "pr");
	writeConfig("source", "");

	console.log(`✓ Bound to ${remote} at ${abs}.`);
	restampBoundSkill();
}

export function cmdBind(args: string[]): void {
	const positionals = args.filter((a) => !a.startsWith("--"));
	const target = positionals[0];
	const pathArg = positionals[1];
	if (!target) {
		throw new Error(
			"Usage: folio bind <ns/repo | path> [path] [--remote|--local] [--web] [--force]",
		);
	}

	const force = args.includes("--force");
	const hasWeb = args.includes("--web");
	const wantRemote = args.includes("--remote");
	const wantLocal = args.includes("--local");
	if (wantRemote && wantLocal) {
		throw new Error("--remote and --local are mutually exclusive.");
	}

	// Two positionals: clone <owner/repo> into <path>.
	if (pathArg) {
		if (wantLocal) {
			throw new Error(
				"--local doesn't apply to 'folio bind <owner/repo> <path>'.",
			);
		}
		bindRemoteInto(target, pathArg, force);
		if (hasWeb) cmdWeb([]);
		return;
	}

	const kind = wantRemote
		? "remote"
		: wantLocal
			? "local"
			: resolveBindTarget(target);

	if (kind === "local") {
		bindLocal(target, force);
		return;
	}

	bindRemote(target, force);

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
	if (hasRemote()) fetchMain();

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
				if (hasRemote()) {
					run(
						`git -C "${baseRepo()}" push origin --delete "${branch}" 2>/dev/null || true`,
					);
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
			if (hasRemote()) {
				run(`git -C "${path}" pull --rebase --quiet 2>/dev/null || true`);
			}
			console.log(`✓ Resumed draft '${slug}'.`);
			return;
		}
	}

	// Create new
	if (worktreeExists(path)) {
		throw new Error(`draft '${slug}' already exists. Drop it first.`);
	}

	// Worktree add from a fetched remote-tracking ref (or the local main
	// branch with no remote) — never checkout/pull the shared base repo
	// itself, which other concurrent drafts may be mid-operation on.
	const branch = `amend/${slug}`;
	console.log(`Creating draft worktree for '${slug}'...`);
	const wt = run(
		`git -C "${baseRepo()}" worktree add -b "${branch}" "${path}" ${mainRef()} --quiet 2>/dev/null`,
	);
	if (wt.exitCode !== 0) {
		throw new Error(`Failed to create worktree for '${slug}'.`);
	}

	console.log(`✓ Draft '${slug}' created.`);
	console.log(`  store: ${path}/`);
	console.log(`  next:  edit leaves in the store, then`);
	console.log(`         folio proof ${topic}`);
}

// ── shared draft helpers ─────────────────────────────────────────────

/** Usage examples shown in resolveDraft's "no topic" error, per verb. */
const VERB_EXAMPLES: Record<string, string> = {
	proof: "folio proof <topic>",
	publish: "folio publish <topic>",
	drop: "folio drop <topic> --force",
};

/**
 * Split a leading topic positional out of an arg list, skipping any
 * recognized `flag value` pairs so a flag's value (e.g. the message text
 * after `-m`, or the spec name after `--spec`) is never mistaken for the
 * topic. Everything not consumed as the topic is returned as `rest`, in
 * original order, for the caller's own flag parsing.
 */
function extractTopic(
	args: string[],
	valueFlags: string[] = [],
): { topic?: string; rest: string[] } {
	const rest: string[] = [];
	let topic: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i] as string;
		if (valueFlags.includes(arg)) {
			rest.push(arg);
			if (i + 1 < args.length) {
				rest.push(args[++i] as string);
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

/**
 * Resolve the draft a verb operates on: explicit topic argument first, then
 * $FOLIO_DRAFT, then a teaching error. This is the multiplayer-safe
 * replacement for the old shared `active` config pointer — both args and
 * env live at the process boundary, so concurrent agents never collide.
 */
function resolveDraft(
	verb: string,
	args: string[],
	valueFlags: string[] = [],
	adoptRemote = false,
): { slug: string; path: string; rest: string[] } {
	const { topic: explicit, rest } = extractTopic(args, valueFlags);
	const topic = explicit ?? process.env.FOLIO_DRAFT;
	if (!topic) {
		const example = VERB_EXAMPLES[verb] ?? `folio ${verb} <topic>`;
		throw new Error(
			`No draft specified. Pass a topic ('${example}') or set FOLIO_DRAFT.`,
		);
	}

	const slug = topicToSlug(topic);
	const path = amendmentPath(slug);
	if (!worktreeExists(path)) {
		if (adoptRemote && getStrategy() === "pr" && hasRemote()) {
			const remote = getRemote();
			const branch = `amend/${slug}`;
			const pr = findOpenPRResult(remote, branch);
			if (pr.error) {
				throw new Error(
					`Could not look up remote draft '${slug}': ${pr.error}`,
				);
			}
			if (!pr.number) {
				throw new Error(
					`Worktree for '${slug}' not found, and no open PR exists for ${branch}. Run 'folio draft ${topic}'.`,
				);
			}

			const branchExists =
				run(
					`git -C "${baseRepo()}" show-ref --verify --quiet "refs/heads/${branch}"`,
					{ quiet: true },
				).exitCode === 0;
			console.log(
				`Adopting remote-only draft '${slug}' from PR #${pr.number}...`,
			);
			const fetch = run(
				`git -C "${baseRepo()}" fetch origin "${branch}" --quiet 2>&1`,
				{ quiet: true },
			);
			if (fetch.exitCode !== 0) {
				throw new Error(
					`Could not fetch remote draft '${slug}' from ${branch}: ${fetch.stderr || fetch.stdout}`,
				);
			}
			if (branchExists) {
				const reset = run(
					`git -C "${baseRepo()}" branch -f "${branch}" "origin/${branch}" --quiet 2>&1`,
					{ quiet: true },
				);
				if (reset.exitCode !== 0) {
					throw new Error(
						`Could not reset local draft branch '${branch}' to origin/${branch}: ${reset.stderr || reset.stdout}`,
					);
				}
			}
			const worktree = branchExists
				? run(
						`git -C "${baseRepo()}" worktree add "${path}" "${branch}" --quiet 2>&1`,
						{ quiet: true },
					)
				: run(
						`git -C "${baseRepo()}" worktree add -b "${branch}" "${path}" "origin/${branch}" --quiet 2>&1`,
						{ quiet: true },
					);
			if (worktree.exitCode !== 0) {
				throw new Error(
					`Could not create worktree for remote draft '${slug}': ${worktree.stderr || worktree.stdout}`,
				);
			}
			return { slug, path, rest };
		}
		throw new Error(
			`Worktree for '${slug}' not found. Run 'folio draft ${topic}'.`,
		);
	}
	return { slug, path, rest };
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
	const pr = findOpenPRResult(remote, branch);
	return pr.number;
}

function findOpenPRResult(
	remote: string,
	branch: string,
): { number: string; error: string } {
	const prNum = gh(
		`pr list --head "${branch}" --state open --json number --jq '.[0].number'`,
		remote,
	);
	if (prNum.exitCode !== 0) {
		return { number: "", error: prNum.stderr || prNum.stdout || "gh failed" };
	}
	return {
		number: prNum.stdout && prNum.stdout !== "null" ? prNum.stdout : "",
		error: "",
	};
}

// ── main-repo lock ───────────────────────────────────────────────────
//
// A coarse mutual-exclusion around the few ops that still mutate the
// shared `.main` base repo in place — status -u's fast-forward and
// merge-strategy publish. mkdir is atomic across processes, so it doubles
// as the lock primitive; a lock older than the staleness timeout is
// assumed abandoned (crashed process) and reclaimed. No daemon, no queue —
// just enough to keep two concurrent fast-forwards from racing.

const LOCK_PATH = `${STORE_DIR}/.lock`;
const LOCK_STALE_MS = 60_000;
const LOCK_WAIT_MS = 5_000;

function lockAgeMs(): number | null {
	try {
		return Date.now() - statSync(LOCK_PATH).mtimeMs;
	} catch {
		return null;
	}
}

function acquireMainLock(): void {
	const deadline = Date.now() + LOCK_WAIT_MS;
	for (;;) {
		try {
			mkdirSync(LOCK_PATH);
			return;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

			const age = lockAgeMs();
			if (age === null || age > LOCK_STALE_MS) {
				run(`rm -rf "${LOCK_PATH}"`, { quiet: true });
				continue;
			}
			if (Date.now() > deadline) {
				throw new Error(
					"Another folio process is updating the shared repo. Try again shortly.",
				);
			}
			run("sleep 0.2", { quiet: true });
		}
	}
}

function releaseMainLock(): void {
	run(`rm -rf "${LOCK_PATH}"`, { quiet: true });
}

function withMainLock<T>(fn: () => T): T {
	acquireMainLock();
	try {
		return fn();
	} finally {
		releaseMainLock();
	}
}

// ── proof ──────────────────────────────────────────────────────────

function commitDraftChanges(path: string, slug: string, rest: string[]): void {
	let msg = `amend: ${slug}`;
	const mIdx = rest.indexOf("-m");
	if (mIdx >= 0 && mIdx + 1 < rest.length) {
		msg = rest[mIdx + 1] as string;
	}

	run(`git -C "${path}" add -A`);
	const commit = run(
		`git -C "${path}" commit -m "${msg.replace(/"/g, '\\"')}" --quiet`,
	);
	if (commit.exitCode !== 0) {
		throw new Error(`Commit failed: ${commit.stderr || commit.stdout}`);
	}
}

export function cmdProof(args: string[]): void {
	ensureConfig();
	const local = getStrategy() === "merge";
	const remote = local ? "" : getRemote();
	if (!local) ensureGh();

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
		throw new Error(
			`Lint found issues in '${slug}'. Fix them, then re-run 'folio proof ${slug}'.`,
		);
	}

	console.log(`Rebasing '${branch}' onto main...`);
	const rebase = run(
		`git -C "${path}" rebase ${mainRef()} --quiet 2>/dev/null`,
	);
	if (rebase.exitCode !== 0) {
		throw new Error(
			`REBASE CONFLICT in ${slug} — resolve in ${path}/ then re-run 'folio proof ${slug}'.`,
		);
	}

	if (local) {
		const diffStat = run(
			`git -C "${path}" diff ${mainRef()}...HEAD --stat 2>/dev/null`,
			{ quiet: true },
		).stdout;
		console.log(`✓ Proofed '${slug}' — changes vs main:`);
		console.log(diffStat || "  (no changes)");
		console.log(`Run 'folio publish ${slug}' when ready.`);
		return;
	}

	// A fresh draft has no origin/<branch> tracking ref yet. Assert that the
	// remote ref is absent for its first lease-protected push, then record the
	// upstream so later pushes use Git's normal tracking-ref lease.
	const hasRemoteTracking =
		run(
			`git -C "${path}" show-ref --verify --quiet "refs/remotes/origin/${branch}"`,
			{ quiet: true },
		).exitCode === 0;
	const lease = hasRemoteTracking
		? "--force-with-lease"
		: `--force-with-lease=refs/heads/${branch}:`;

	// Force-push and create/update the draft PR.
	const push = run(
		`git -C "${path}" push --set-upstream ${lease} origin "${branch}" --quiet 2>&1`,
	);
	if (push.exitCode !== 0) {
		throw new Error("Push failed. Check network and access.");
	}

	const prNum = findOpenPR(remote, branch);
	const msg = run(`git -C "${path}" log -1 --format=%B`, {
		quiet: true,
	}).stdout;
	const title = (msg.split("\n")[0] || `amend: ${slug}`).replace(/"/g, '\\"');

	if (!prNum) {
		const prResult = run(
			`gh pr create --repo "${remote}" --base main --head "${branch}" --draft --title "${title}" --body "${msg.replace(/"/g, '\\"')}"`,
			{ quiet: true },
		);
		if (prResult.exitCode !== 0) {
			throw new Error(`PR creation failed: ${prResult.stderr}`);
		}
		const newPrNum = prResult.stdout.match(/(\d+)$/)?.[0] || "?";
		console.log(`✓ Proofed '${slug}' — draft PR #${newPrNum} opened`);
		console.log(`  https://github.com/${remote}/pull/${newPrNum}`);
	} else {
		run(
			`gh pr edit --repo "${remote}" ${prNum} --title "${title}" --body "${msg.replace(/"/g, '\\"')}" 2>/dev/null || true`,
			{ quiet: true },
		);
		console.log(`✓ Proofed '${slug}' — draft PR #${prNum} updated`);
		console.log(`  https://github.com/${remote}/pull/${prNum}`);
	}
	console.log(
		`  Review on GitHub and mark it ready, then run 'folio publish ${slug}'.`,
	);
}

// ── publish ────────────────────────────────────────────────────────

function cleanupDraft(slug: string, path: string, branch: string): void {
	run(
		`git -C "${baseRepo()}" worktree remove "${path}" --force 2>/dev/null || rm -rf "${path}"`,
	);
	run(`git -C "${baseRepo()}" branch -D "${branch}" 2>/dev/null || true`);
	console.log(`  Draft '${slug}' closed.`);
}

function ensurePublishCurrency(slug: string, branch: string): void {
	if (getStrategy() === "pr") {
		fetchMain();
	}

	const check = run(
		`git -C "${baseRepo()}" merge-base --is-ancestor ${mainRef()} "${branch}" 2>/dev/null`,
		{ quiet: true },
	);
	if (check.exitCode !== 0) {
		throw new Error(
			`main moved since proof — run 'folio proof ${slug} && folio publish ${slug}'`,
		);
	}
}

function translatePublishFailure(
	slug: string,
	branch: string,
	prNum: string | undefined,
	output: string,
): string {
	const text = output.trim() || "Merge failed.";
	if (/(still a draft|draft state|draft pull request)/i.test(text)) {
		if (prNum) {
			return `PR #${prNum} is still a draft — flip ready on GitHub, then re-run 'folio publish ${slug}'`;
		}
		return `Draft PR is still a draft — flip ready on GitHub, then re-run 'folio publish ${slug}'`;
	}
	if (
		/(merge conflict|conflict|not up to date|out of date|behind|main moved|rebase)/i.test(
			text,
		)
	) {
		return `Merge blocked by conflicts or a stale branch — run 'folio proof ${slug}' first.`;
	}
	if (
		/(protected branch|branch protection|required status checks|ruleset)/i.test(
			text,
		)
	) {
		return `Merge blocked by branch protection: ${text}. Check repository settings or required status checks.`;
	}
	return `Merge failed for ${branch}: ${text}`;
}

export function cmdPublish(args: string[]): void {
	ensureConfig();
	const local = getStrategy() === "merge";
	const remote = local ? "" : getRemote();
	if (!local) ensureGh();

	const { slug, path } = resolveDraft("publish", args);
	const branch = amendmentBranch(path);
	if (!branch || branch === "?") {
		throw new Error(`Draft '${slug}' is not on a branch.`);
	}

	if (local) {
		ensurePublishCurrency(slug, branch);
		// Merge-strategy publish mutates the shared base repo's main branch —
		// serialize with status -u under the coarse lock.
		const merge = withMainLock(() =>
			run(`git -C "${baseRepo()}" merge "${branch}" --squash --quiet 2>&1`),
		);
		if (merge.exitCode !== 0) {
			throw new Error(
				translatePublishFailure(
					slug,
					branch,
					undefined,
					merge.stderr || merge.stdout,
				),
			);
		}
		const commit = withMainLock(() =>
			run(`git -C "${baseRepo()}" commit -m "publish: ${slug}" --quiet 2>&1`),
		);
		if (commit.exitCode !== 0) {
			throw new Error(`Merge commit failed: ${commit.stderr || commit.stdout}`);
		}
		console.log(`✓ Published '${slug}' into main.`);
		cleanupDraft(slug, path, branch);
		return;
	}

	const prNum = findOpenPR(remote, branch);
	if (!prNum) {
		throw new Error(
			`No open PR for '${slug}'. Run 'folio proof ${slug}' first to send it for review.`,
		);
	}

	ensurePublishCurrency(slug, branch);

	const merge = run(
		`gh pr merge --repo "${remote}" ${prNum} --squash --delete-branch 2>&1`,
	);
	if (merge.exitCode !== 0) {
		throw new Error(
			translatePublishFailure(
				slug,
				branch,
				prNum,
				merge.stderr || merge.stdout,
			),
		);
	}
	console.log(`✓ Published '${slug}' — PR #${prNum} merged.`);

	// Under pr strategy main follows origin — fast-forward the checkout.
	// This mutates the shared base repo, same as status -u — under the lock.
	const ff = withMainLock(() =>
		run(
			`git -C "${baseRepo()}" checkout main --quiet 2>/dev/null && git -C "${baseRepo()}" pull --ff-only origin main --quiet 2>/dev/null`,
			{ quiet: true },
		),
	);
	if (ff.exitCode !== 0) {
		console.log(
			"  (couldn't fast-forward main from origin — run 'folio status -u')",
		);
	}

	cleanupDraft(slug, path, branch);
}

// ── drop ───────────────────────────────────────────────────────────

export function cmdDrop(args: string[]): void {
	const { topic: explicit, rest } = extractTopic(args);
	const force = rest.includes("--force");
	const topic = explicit ?? process.env.FOLIO_DRAFT;

	if (!topic) {
		throw new Error(
			`No draft specified. Pass a topic ('${VERB_EXAMPLES.drop}') or set FOLIO_DRAFT.`,
		);
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

	// Check for open PR
	let prNum = "";
	if (remoteBound && branch && branch !== "?") {
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
	if (remoteBound && branch && branch !== "?") {
		run(
			`git -C "${baseRepo()}" push origin --delete "${branch}" 2>/dev/null || true`,
		);
		console.log(`  Deleted remote branch '${branch}'.`);
	}

	// Remove worktree
	run(
		`git -C "${baseRepo()}" worktree remove "${path}" --force 2>/dev/null || rm -rf "${path}"`,
	);

	// Merge strategy keeps branches in the bound repo — clean up the amend
	// branch unless it was merged (drop --force may discard unmerged work by
	// design).
	if (merge && branch && branch !== "?") {
		run(`git -C "${baseRepo()}" branch -D "${branch}" 2>/dev/null || true`);
	}
	console.log(`✓ Dropped amendment '${slug}'.`);
}

// ── status ─────────────────────────────────────────────────────────

/** `folio status` fetches in pr strategy so update guidance is fresh. */
/**
 * Stateless drift check: does the installed skill's stamped scent still
 * match the bound block's live INDEX description? Silent when there's no
 * skill config key, no installed SKILL.md, or the two already agree.
 */
function printSkillDrift(): void {
	const skillDir = readConfig("skill");
	if (!skillDir) return;

	const skillPath = join(skillDir, "SKILL.md");
	const current = readSkillDescription(skillPath);
	if (current === undefined) return;

	const installedScent = extractScent(current);
	const liveScent = readIndexDescription(baseRepo());
	if (installedScent === liveScent) return;

	console.log("Skill description out of date, run `folio skill install`");
}

/**
 * A draft's one-line dashboard state: dirty (uncommitted changes), saved
 * (committed, no open PR yet — or no remote at all), or proofed (an open
 * PR exists, draft or ready). Degrades gracefully with no remote or a
 * failed gh lookup: `pr`/`prDraft` are simply absent, so it reads "saved".
 */
function draftState(d: {
	status: string;
	prNumber?: string;
	prDraft?: boolean;
}): string {
	if (d.status === "dirty") return "dirty";
	if (d.prNumber) {
		return d.prDraft
			? `proofed · PR #${d.prNumber} draft`
			: `proofed · PR #${d.prNumber} ready`;
	}
	return "saved";
}

function branchIncludesMain(branch: string): boolean {
	return (
		run(
			`git -C "${baseRepo()}" merge-base --is-ancestor ${mainRef()} "${branch}" 2>/dev/null`,
			{ quiet: true },
		).exitCode === 0
	);
}

/** `folio status` is the fleet dashboard: one line per open draft. */
export function cmdStatus(args: string[] = []): void {
	ensureConfig();

	const remote = readConfig("remote");
	const boundPath = getPath();
	if (!remote && !boundPath) {
		console.log(
			"No repo bound. Run 'folio bind <ns/repo | path>' or 'folio create <path>'.",
		);
		return;
	}

	printSkillDrift();

	const update = args.includes("-u") || args.includes("--update");
	const bound = boundPath ?? (remote as string);
	const base = baseRepo();

	let fetchFailed = false;
	if (hasRemote()) {
		const before = run(`git -C "${base}" rev-parse origin/main 2>/dev/null`, {
			quiet: true,
		}).stdout;
		fetchMain();
		const after = run(`git -C "${base}" rev-parse origin/main 2>/dev/null`, {
			quiet: true,
		}).stdout;
		fetchFailed = before === "" && after === "";
	}
	const staleNote = fetchFailed
		? " (couldn't reach remote — showing cached state)"
		: "";

	// Main's own state: dirty, behind, or up to date.
	const mainDirty =
		run(`git -C "${base}" diff --quiet -- '*.md' 2>/dev/null || echo dirty`, {
			quiet: true,
		}).stdout !== "" ||
		run(
			`git -C "${base}" diff --cached --quiet -- '*.md' 2>/dev/null || echo dirty`,
			{ quiet: true },
		).stdout !== "";

	if (mainDirty) {
		console.log("Main has unsaved changes");
	} else {
		const behind = mainExists() ? behindCount() : 0;
		if (behind > 0) {
			if (update) {
				// status -u fast-forwards the shared base repo — the same
				// mutation publish (merge strategy) performs, so it takes the
				// same lock.
				const pull = withMainLock(() =>
					run(`git -C "${base}" pull --ff-only origin main --quiet 2>&1`),
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

	// Fleet dashboard — every open draft worktree under stores/amendments/.
	const drafts = listAmendments();
	if (getStrategy() === "pr" && remote) {
		const remoteDrafts = listOpenPRMap(remote);
		const rows = new Map<
			string,
			{ topic: string; state: string; branch: string }
		>();

		for (const draft of drafts) {
			const branch = `amend/${draft.topic}`;
			const info = remoteDrafts.get(branch);
			const proofed =
				info && draft.status !== "dirty" && branchIncludesMain(branch);
			rows.set(branch, {
				topic: draft.topic,
				state: info
					? `${proofed ? "proofed" : "unproofed"} · PR #${info.number} ${
							info.isDraft ? "(draft)" : "(ready)"
						}`
					: "unproofed",
				branch,
			});
		}

		for (const [branch, info] of remoteDrafts) {
			if (rows.has(branch)) continue;
			const topic = branch.startsWith("amend/")
				? branch.slice("amend/".length)
				: branch;
			rows.set(branch, {
				topic,
				state: `unproofed · PR #${info.number} ${
					info.isDraft ? "(draft)" : "(ready)"
				}`,
				branch,
			});
		}

		const ordered = [...rows.values()].sort((a, b) =>
			a.topic.localeCompare(b.topic),
		);
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

// ── config command ────────────────────────────────────────────────

export function cmdConfig(args: string[]): void {
	ensureConfig();

	const key = args[0] as string | undefined;
	const value = args[1] as string | undefined;

	if (!key) {
		// Show all config
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
		// Resolved paths (computed, not stored)
		console.log(`resolved: ${bound ? baseRepo() : "(not bound)"}`);
		console.log(`amendments: ${AMEND_DIR}`);
		return;
	}

	if (!value) {
		// Read single key
		const val = readConfig(key as ConfigKey);
		console.log(val || "");
		return;
	}

	// Location is a bind-time decision — moving the checkout means re-binding.
	if (key === "path" || key === "source") {
		throw new Error(
			"path is set at bind time — run 'folio bind <owner/repo | path> [path]' to move the checkout.",
		);
	}

	if (key === "strategy") {
		if (value !== "merge" && value !== "pr") {
			throw new Error("strategy must be 'merge' or 'pr'.");
		}
		if (value === "pr" && !hasRemote()) {
			const origin = getPath() ? parseGitHubOrigin(baseRepo()) : null;
			if (origin) {
				throw new Error(
					`strategy pr needs a remote. origin is github.com/${origin} — run 'folio config remote ${origin}', then retry.`,
				);
			}
			throw new Error(
				"strategy pr needs a remote — run 'folio config remote <owner/repo>' first.",
			);
		}
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
		if (getPath()) {
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

// ── lint ───────────────────────────────────────────────────────────

/**
 * lint's target resolves the same way a draft verb's does — explicit topic
 * argument, then $FOLIO_DRAFT — but falls back to main instead of erroring
 * when neither is set, since "lint what's bound" is a meaningful default
 * (unlike proof/publish, which are meaningless without a draft).
 */
export function cmdLint(args: string[]): void {
	ensureConfig();

	const { topic, rest } = extractTopic(args, ["--spec"]);
	const json = rest.includes("--json");
	const strict = rest.includes("--strict");
	const specIdx = rest.indexOf("--spec");
	const spec = specIdx >= 0 ? rest[specIdx + 1] : "folio";
	if (specIdx >= 0 && !spec) {
		throw new Error(
			"Usage: folio lint [<topic>] [--spec folio] [--json] [--strict]",
		);
	}

	const draftTopic = topic ?? process.env.FOLIO_DRAFT;
	let storeDir: string;

	if (draftTopic) {
		const slug = topicToSlug(draftTopic);
		const path = amendmentPath(slug);
		if (!worktreeExists(path)) {
			throw new Error(
				`Worktree for '${slug}' not found. Run 'folio draft ${draftTopic}'.`,
			);
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

// ── skill ──────────────────────────────────────────────────────────

/**
 * Unpacks the skill bundle embedded at build time into <path>, then stamps
 * the written SKILL.md's frontmatter `description` with the bound block's
 * INDEX scent (SPEC.md §7), if any. Deliberately blind to any agent harness
 * beyond that one stamp — it just writes files.
 *
 * Bare `folio skill install` (no path) reuses the path recorded under the
 * `skill` config key from a prior install.
 */
function skillInstall(target: string | undefined): void {
	const recorded = readConfig("skill");
	const resolvedTarget = target ?? recorded;
	if (!resolvedTarget) {
		throw new Error(
			"Usage: folio skill install <path> (no path recorded yet — pass one the first time)",
		);
	}

	const abs = resolvePath(resolvedTarget);
	const files = Object.keys(skillBundle).sort();

	for (const rel of files) {
		const dest = join(abs, rel);
		mkdirSync(dirname(dest), { recursive: true });
		writeFileSync(dest, skillBundle[rel] as string, "utf-8");
		console.log(`wrote ${rel}`);
	}

	writeConfig("skill", abs);
	restampSkillFile(join(abs, "SKILL.md"), baseRepo());

	console.log(`\n${files.length} file(s) written to ${abs}`);
}

export function cmdSkill(args: string[]): void {
	const [sub, ...rest] = args;

	if (sub === "install") {
		skillInstall(rest[0]);
		return;
	}

	throw new Error("Usage: folio skill install [path]");
}
