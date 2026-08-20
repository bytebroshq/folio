import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { hasLintErrors, lint, printLintResult } from "@folio/core";
import {
	amendmentPath,
	type Binding,
	baseRepo,
	bindingAmendmentsPath,
	bindingCheckoutPath,
	type ConfigKey,
	canonicalPath,
	clearBindingContext,
	ensureConfig,
	getBindings,
	getRemote,
	getStrategy,
	hasRemote,
	loadConfig,
	parseQualifiedTopic,
	readConfig,
	resolvePath,
	STORE_DIR,
	saveConfig,
	setBindingContext,
	writeConfig,
} from "./config";
import {
	amendmentBranch,
	behindCount,
	currentBranch,
	ensureBase,
	ensureGh,
	fetchMain,
	gh,
	gitFile,
	isDirty,
	isMergedToMain,
	listAmendments,
	listMergedPRMap,
	listOpenPRMap,
	listRegisteredWorktrees,
	mainExists,
	mainRef,
	parseGitHubOrigin,
	registeredAmendmentPath,
	run,
	runFile,
	worktreeExists,
} from "./git";
import {
	downloadReleaseAsset,
	getRelease,
	SKILL_ASSET,
	updateCli,
} from "./release";
import { enrichDescription, readIndexDescription } from "./skill-enrichment";

// ── bind ───────────────────────────────────────────────────────────

export function cmdBind(args: string[]): void {
	const alias = args[0];
	if (!alias || !/^[a-z0-9][a-z0-9-]*$/.test(alias))
		throw new Error(
			"Usage: folio bind <binding> --github <owner/repo> [--path <path>] [--description <text>] [--strategy merge|pr]",
		);
	const value = (flag: string): string | null => {
		const index = args.indexOf(flag);
		return index >= 0 ? (args[index + 1] ?? null) : null;
	};
	const github = value("--github");
	const path = value("--path");
	const description = value("--description");
	const strategy = (value("--strategy") ?? (github ? "pr" : "merge")) as
		| "merge"
		| "pr";
	if (strategy !== "merge" && strategy !== "pr")
		throw new Error("strategy must be 'merge' or 'pr'.");
	if (strategy === "pr" && !github)
		throw new Error("strategy pr requires --github <owner/repo>.");
	if (!github && !path)
		throw new Error("Provide --github <owner/repo> or --path <local-repo>.");
	ensureConfig();
	const config = loadConfig();
	if (config.bindings[alias])
		throw new Error(`Binding '${alias}' already exists.`);
	const abs = resolvePath(path ?? bindingCheckoutPath(alias));
	const canonicalAbs = canonicalPath(abs);
	const githubKey = github?.toLowerCase();
	const duplicateGithub =
		github &&
		Object.entries(config.bindings).find(
			([, binding]) => binding.github?.toLowerCase() === githubKey,
		);
	if (duplicateGithub)
		throw new Error(
			`GitHub repo '${github}' is already bound as '${duplicateGithub[0]}'.`,
		);
	const duplicatePath = Object.entries(config.bindings).find(
		([, binding]) => canonicalPath(binding.path) === canonicalAbs,
	);
	if (duplicatePath)
		throw new Error(`Path '${abs}' is already bound as '${duplicatePath[0]}'.`);
	if (github && !existsSync(`${abs}/.git`)) {
		mkdirSync(dirname(abs), { recursive: true });
		const clone = gitFile([
			"clone",
			"--quiet",
			`git@github.com:${github}.git`,
			abs,
		]);
		if (clone.exitCode !== 0)
			throw new Error(`Failed to clone ${github}. Check access and try again.`);
	}
	if (!existsSync(`${abs}/.git`))
		throw new Error(`${abs} is not a git repository.`);
	if (github) {
		const origin = parseGitHubOrigin(abs);
		if (!origin || origin.toLowerCase() !== githubKey)
			throw new Error(
				`${abs} is not a checkout of '${github}' (origin: ${origin ?? "not a GitHub repository"}).`,
			);
	}
	const hasMain =
		gitFile(["-C", abs, "rev-parse", "--verify", "main"], { quiet: true })
			.exitCode === 0;
	if (!hasMain)
		throw new Error(
			`${abs} has no 'main' branch. Folio uses main as published truth.`,
		);
	const worktreeConfig = gitFile(
		["-C", abs, "config", "extensions.worktreeConfig", "true"],
		{ quiet: true },
	);
	if (worktreeConfig.exitCode !== 0)
		throw new Error(`Could not enable Git worktree configuration in ${abs}.`);
	const inferred =
		description ??
		readIndexDescription(abs) ??
		`Folio knowledge block '${alias}'.`;
	config.bindings[alias] = {
		id: `bnd_${createHash("sha256")
			.update(`${alias}\0${github ?? ""}\0${abs}`)
			.digest("hex")
			.slice(0, 8)}`,
		description: inferred,
		path: abs,
		github,
		strategy,
	};
	saveConfig(config);
	mkdirSync(bindingAmendmentsPath(config.bindings[alias]), { recursive: true });
	console.log(`✓ Bound '${alias}' to ${github ?? abs}.`);
}

// ── create ─────────────────────────────────────────────────────────

const INDEX_SCAFFOLD = `---
title: New knowledge block
description: Concise knowledge for this block.
---

# Index

Map this block with leaf entries and group links. Create ordinary knowledge
leaves under leaves/ with type, title, and description frontmatter.
`;

export function cmdCreate(args: string[]): void {
	const alias = args.find((a) => !a.startsWith("--"));
	const pathArg = args.includes("--path")
		? args[args.indexOf("--path") + 1]
		: null;
	if (!alias || !pathArg)
		throw new Error(
			"Usage: folio create <binding> --path <path> [--description <text>]",
		);

	const abs = resolvePath(pathArg as string);

	if (existsSync(abs) && readdirSync(abs).length > 0) {
		throw new Error(`${abs} already exists and is not empty.`);
	}

	mkdirSync(join(abs, "leaves"), { recursive: true });
	writeFileSync(join(abs, "index.md"), INDEX_SCAFFOLD, "utf-8");
	writeFileSync(join(abs, "leaves", ".gitkeep"), "", "utf-8");

	const init = gitFile(["-C", abs, "init", "-b", "main", "--quiet"]);
	if (init.exitCode === 0) gitFile(["-C", abs, "add", "-A"]);
	if (init.exitCode === 0)
		gitFile([
			"-C",
			abs,
			"commit",
			"-m",
			"folio: scaffold knowledge block",
			"--quiet",
		]);
	if (init.exitCode !== 0) {
		throw new Error(`git init failed in ${abs}: ${init.stderr}`);
	}

	console.log(`✓ Created folio at ${abs}`);
	console.log("  index.md, leaves/");
	console.log("  git init, initial commit");

	cmdBind([
		alias,
		"--path",
		abs,
		...(args.includes("--description")
			? ["--description", args[args.indexOf("--description") + 1] as string]
			: []),
	]);
}

// ── draft ──────────────────────────────────────────────────────────

/** Create a new draft, or resume an existing one. Idempotent. */
export function cmdDraft(args: string[]): void {
	ensureConfig();
	const { topic: identity, rest } = extractTopic(args);
	if (!identity)
		throw new Error("Usage: folio draft <binding>:<topic> [--force]");
	const qualified = parseQualifiedTopic(identity);
	setBindingContext(qualified.binding);
	ensureBase();
	if (hasRemote()) fetchMain();
	const force = rest.includes("--force");
	const { slug } = qualified;
	const registered = registeredAmendmentPath(slug, qualified.binding);
	const path = registered ?? amendmentPath(slug, qualified.binding);
	if (!registered && worktreeExists(path))
		throw new Error(
			`Refusing to operate on unregistered worktree for '${identity}'.`,
		);

	if (worktreeExists(path)) {
		const branch = amendmentBranch(path);
		const merged = isMergedToMain(branch);

		if (merged) {
			if (force) {
				console.log(
					`Draft '${identity}' was already published. Deleting and starting fresh...`,
				);
				gitFile(["-C", baseRepo(), "branch", "-D", branch], { quiet: true });
				if (hasRemote()) {
					gitFile(["-C", baseRepo(), "push", "origin", "--delete", branch], {
						quiet: true,
					});
				}
				const removed = gitFile(
					["-C", baseRepo(), "worktree", "remove", path, "--force"],
					{ quiet: true },
				);
				if (removed.exitCode !== 0)
					throw new Error(
						`Could not remove registered worktree for '${identity}': ${removed.stderr || removed.stdout}`,
					);
			} else {
				throw new Error(
					`draft '${identity}' was already published. Use 'draft ${identity} --force' to restart.`,
				);
			}
		} else {
			// Open draft — resume it
			console.log(`Rebasing ${identity} onto main...`);
			const rebase = gitFile(["-C", path, "rebase", mainRef(), "--quiet"], {
				quiet: true,
			});
			if (rebase.exitCode !== 0) {
				throw new Error(
					`Rebase conflict in ${identity}. Resolve in ${path}/ then re-run 'folio proof ${identity}'.`,
				);
			}
			if (hasRemote()) {
				gitFile(["-C", path, "pull", "--rebase", "--quiet"], { quiet: true });
			}
			console.log(`✓ Resumed draft '${identity}'.`);
			return;
		}
	}

	// Create new
	if (worktreeExists(path)) {
		throw new Error(`draft '${identity}' already exists. Drop it first.`);
	}

	// Worktree add from a fetched remote-tracking ref (or the local main
	// branch with no remote) — never checkout/pull the shared base repo
	// itself, which other concurrent drafts may be mid-operation on.
	const branch = `amend/${slug}`;
	console.log(`Creating draft worktree for '${identity}'...`);
	const wt = gitFile(
		[
			"-C",
			baseRepo(),
			"worktree",
			"add",
			"-b",
			branch,
			path,
			mainRef(),
			"--quiet",
		],
		{ quiet: true },
	);
	if (wt.exitCode !== 0) {
		throw new Error(`Failed to create worktree for '${identity}'.`);
	}

	console.log(`✓ Draft '${identity}' created.`);
	console.log(`  store: ${path}/`);
	console.log(`  next:  edit leaves in the store, then`);
	console.log(`         folio proof ${identity}`);
}

// ── shared draft helpers ─────────────────────────────────────────────

/** Usage examples shown in resolveDraft's "no topic" error, per verb. */
const VERB_EXAMPLES: Record<string, string> = {
	proof: "folio proof <binding>:<topic>",
	publish: "folio publish <binding>:<topic>",
	drop: "folio drop <binding>:<topic> --force",
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
 * $FOLIO_DRAFT, then a teaching error. Qualification selects the repository
 * and amendment worktree together, so the operation cannot drift across blocks.
 */
function resolveDraft(
	verb: string,
	args: string[],
	valueFlags: string[] = [],
	adoptRemote = false,
): {
	slug: string;
	path: string;
	identity: string;
	rest: string[];
	binding: Binding;
} {
	const { topic: explicit, rest } = extractTopic(args, valueFlags);
	const identity = explicit ?? process.env.FOLIO_DRAFT;
	if (!identity) {
		const example = VERB_EXAMPLES[verb] ?? `folio ${verb} <topic>`;
		throw new Error(
			`No draft specified. Pass a topic ('${example}') or set FOLIO_DRAFT.`,
		);
	}

	const qualified = parseQualifiedTopic(identity);
	setBindingContext(qualified.binding);
	ensureBase();
	const { slug, binding } = qualified;
	const registered = registeredAmendmentPath(slug, binding);
	const path = registered ?? (adoptRemote ? amendmentPath(slug, binding) : "");
	if (!path)
		throw new Error(
			`Worktree for '${identity}' is not a registered amend/${slug} worktree. Run 'folio draft ${identity}'.`,
		);
	if (!worktreeExists(path)) {
		if (adoptRemote && getStrategy() === "pr" && hasRemote()) {
			const remote = getRemote();
			const branch = `amend/${slug}`;
			const pr = findOpenPRResult(remote, branch);
			if (pr.error) {
				throw new Error(
					`Could not look up remote draft '${identity}': ${pr.error}`,
				);
			}
			if (!pr.number) {
				throw new Error(
					`Worktree for '${identity}' not found, and no open PR exists for ${branch}. Run 'folio draft ${identity}'.`,
				);
			}

			const branchExists =
				gitFile(
					[
						"-C",
						baseRepo(),
						"show-ref",
						"--verify",
						"--quiet",
						`refs/heads/${branch}`,
					],
					{ quiet: true },
				).exitCode === 0;
			console.log(
				`Adopting remote-only draft '${identity}' from PR #${pr.number}...`,
			);
			const fetch = gitFile(
				["-C", baseRepo(), "fetch", "origin", branch, "--quiet"],
				{ quiet: true },
			);
			if (fetch.exitCode !== 0) {
				throw new Error(
					`Could not fetch remote draft '${identity}' from ${branch}: ${fetch.stderr || fetch.stdout}`,
				);
			}
			if (branchExists) {
				const reset = gitFile(
					[
						"-C",
						baseRepo(),
						"branch",
						"-f",
						branch,
						`origin/${branch}`,
						"--quiet",
					],
					{ quiet: true },
				);
				if (reset.exitCode !== 0) {
					throw new Error(
						`Could not reset local draft branch '${branch}' to origin/${branch}: ${reset.stderr || reset.stdout}`,
					);
				}
			}
			const worktree = branchExists
				? gitFile(
						["-C", baseRepo(), "worktree", "add", path, branch, "--quiet"],
						{ quiet: true },
					)
				: gitFile(
						[
							"-C",
							baseRepo(),
							"worktree",
							"add",
							"-b",
							branch,
							path,
							`origin/${branch}`,
							"--quiet",
						],
						{ quiet: true },
					);
			if (worktree.exitCode !== 0) {
				throw new Error(
					`Could not create worktree for remote draft '${identity}': ${worktree.stderr || worktree.stdout}`,
				);
			}
			return { slug, path, identity, rest, binding };
		}
		throw new Error(
			`Worktree for '${identity}' not found. Run 'folio draft ${identity}'.`,
		);
	}
	return { slug, path, identity, rest, binding };
}

function draftHasChanges(path: string): boolean {
	const diff = gitFile(["-C", path, "diff", "--quiet"], { quiet: true });
	const cached = gitFile(["-C", path, "diff", "--cached", "--quiet"], {
		quiet: true,
	});
	const untracked = gitFile(
		["-C", path, "ls-files", "--others", "--exclude-standard"],
		{ quiet: true },
	);
	return (
		diff.exitCode !== 0 || cached.exitCode !== 0 || untracked.stdout !== ""
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
		[
			"pr",
			"list",
			"--head",
			branch,
			"--state",
			"open",
			"--json",
			"number",
			"--jq",
			".[0].number",
		],
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
// shared `.main` base repo in place — sync's fast-forward and
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
				rmSync(LOCK_PATH, { recursive: true, force: true });
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
	rmSync(LOCK_PATH, { recursive: true, force: true });
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

export function proofMessage(
	slug: string,
	rest: string[],
): { message: string; explicit: boolean } {
	const mIdx = rest.indexOf("-m");
	if (mIdx >= 0 && mIdx + 1 < rest.length) {
		return { message: rest[mIdx + 1] as string, explicit: true };
	}
	return { message: `amend: ${slug}`, explicit: false };
}

export function proofMetadataAction(
	hasExistingPR: boolean,
	hasExplicitMessage: boolean,
): "create" | "update" | "preserve" {
	if (!hasExistingPR) return "create";
	return hasExplicitMessage ? "update" : "preserve";
}

function commitDraftChanges(path: string, msg: string): void {
	gitFile(["-C", path, "add", "-A"]);
	const commit = runFile("git", ["-C", path, "commit", "-m", msg, "--quiet"]);
	if (commit.exitCode !== 0) {
		throw new Error(`Commit failed: ${commit.stderr || commit.stdout}`);
	}
}

export function cmdProof(args: string[]): void {
	ensureConfig();
	const { slug, path, identity, rest } = resolveDraft(
		"proof",
		args,
		["-m"],
		true,
	);
	const local = getStrategy() === "merge";
	const remote = local ? "" : getRemote();
	if (!local) ensureGh();

	const proof = proofMessage(slug, rest);
	const branch = amendmentBranch(path);
	if (!branch || branch === "?") {
		throw new Error(`Draft '${identity}' is not on a branch.`);
	}

	if (draftHasChanges(path)) {
		commitDraftChanges(path, proof.message);
	}

	const lintResult = lint(path, { spec: "folio" });
	printLintResult(lintResult);
	if (hasLintErrors(lintResult)) {
		throw new Error(
			`Lint found issues in '${identity}'. Fix them, then re-run 'folio proof ${identity}'.`,
		);
	}

	console.log(`Rebasing '${branch}' onto main...`);
	const rebase = gitFile(["-C", path, "rebase", mainRef(), "--quiet"]);
	if (rebase.exitCode !== 0) {
		throw new Error(
			`REBASE CONFLICT in ${identity} — resolve in ${path}/ then re-run 'folio proof ${identity}'.`,
		);
	}

	if (local) {
		const diffStat = gitFile(
			["-C", path, "diff", `${mainRef()}...HEAD`, "--stat"],
			{ quiet: true },
		).stdout;
		console.log(`✓ Proofed '${identity}' — changes vs main:`);
		console.log(diffStat || "  (no changes)");
		console.log(`Run 'folio publish ${identity}' when ready.`);
		return;
	}

	// A fresh draft has no origin/<branch> tracking ref yet. Assert that the
	// remote ref is absent for its first lease-protected push, then record the
	// upstream so later pushes use Git's normal tracking-ref lease.
	const hasRemoteTracking =
		gitFile(
			[
				"-C",
				path,
				"show-ref",
				"--verify",
				"--quiet",
				`refs/remotes/origin/${branch}`,
			],
			{ quiet: true },
		).exitCode === 0;
	const lease = hasRemoteTracking
		? "--force-with-lease"
		: `--force-with-lease=refs/heads/${branch}:`;

	// Force-push and create/update the draft PR.
	const push = gitFile([
		"-C",
		path,
		"push",
		"--set-upstream",
		lease,
		"origin",
		branch,
		"--quiet",
	]);
	if (push.exitCode !== 0) {
		throw new Error("Push failed. Check network and access.");
	}

	const prNum = findOpenPR(remote, branch);
	const msg =
		gitFile(["-C", path, "log", "-1", "--format=%B"], { quiet: true }).stdout ||
		proof.message;
	const prMessage = proof.explicit ? proof.message : msg;
	const title = prMessage.split("\n")[0] || `amend: ${slug}`;

	const metadataAction = proofMetadataAction(Boolean(prNum), proof.explicit);
	if (metadataAction === "create") {
		const prResult = runFile(
			"gh",
			[
				"pr",
				"create",
				"--repo",
				remote,
				"--base",
				"main",
				"--head",
				branch,
				"--draft",
				"--title",
				title,
				"--body",
				prMessage,
			],
			{ quiet: true },
		);
		if (prResult.exitCode !== 0) {
			throw new Error(`PR creation failed: ${prResult.stderr}`);
		}
		const newPrNum = prResult.stdout.match(/(\d+)$/)?.[0] || "?";
		console.log(`✓ Proofed '${identity}' — draft PR #${newPrNum} opened`);
		console.log(`  https://github.com/${remote}/pull/${newPrNum}`);
	} else if (metadataAction === "update") {
		runFile(
			"gh",
			[
				"pr",
				"edit",
				"--repo",
				remote,
				prNum,
				"--title",
				title,
				"--body",
				prMessage,
			],
			{ quiet: true },
		);
		console.log(`✓ Proofed '${identity}' — draft PR #${prNum} updated`);
		console.log(`  https://github.com/${remote}/pull/${prNum}`);
	} else {
		console.log(`✓ Proofed '${identity}' — draft PR #${prNum} updated`);
		console.log(`  https://github.com/${remote}/pull/${prNum}`);
	}
	console.log(
		`  Review on GitHub and mark it ready, then run 'folio publish ${identity}'.`,
	);
}

// ── publish ────────────────────────────────────────────────────────

function cleanupDraft(
	identity: string,
	slug: string,
	path: string,
	branch: string,
	binding: Binding,
): void {
	if (
		registeredAmendmentPath(slug, binding) !== path ||
		branch !== `amend/${slug}`
	) {
		throw new Error(
			`Refusing to remove unowned worktree for '${identity}'. Expected registered branch amend/${slug}.`,
		);
	}
	const removed = gitFile(
		["-C", baseRepo(), "worktree", "remove", path, "--force"],
		{
			quiet: true,
		},
	);
	if (removed.exitCode !== 0)
		throw new Error(
			`Could not remove registered worktree for '${identity}': ${removed.stderr || removed.stdout}`,
		);
	gitFile(["-C", baseRepo(), "branch", "-D", branch], { quiet: true });
	console.log(`  Draft '${identity}' closed.`);
}

function ensurePublishCurrency(identity: string, branch: string): void {
	if (getStrategy() === "pr") {
		fetchMain();
	}

	const check = gitFile(
		["-C", baseRepo(), "merge-base", "--is-ancestor", mainRef(), branch],
		{ quiet: true },
	);
	if (check.exitCode !== 0) {
		throw new Error(
			`main moved since proof — run 'folio proof ${identity} && folio publish ${identity}'`,
		);
	}
}

function translatePublishFailure(
	identity: string,
	branch: string,
	prNum: string | undefined,
	output: string,
): string {
	const text = output.trim() || "Merge failed.";
	if (/(still a draft|draft state|draft pull request)/i.test(text)) {
		if (prNum) {
			return `PR #${prNum} is still a draft — flip ready on GitHub, then re-run 'folio publish ${identity}'`;
		}
		return `Draft PR is still a draft — flip ready on GitHub, then re-run 'folio publish ${identity}'`;
	}
	if (
		/(merge conflict|conflict|not up to date|out of date|behind|main moved|rebase)/i.test(
			text,
		)
	) {
		return `Merge blocked by conflicts or a stale branch — run 'folio proof ${identity}' first.`;
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
	const { slug, path, identity, binding } = resolveDraft("publish", args);
	const local = getStrategy() === "merge";
	const remote = local ? "" : getRemote();
	if (!local) ensureGh();

	const branch = amendmentBranch(path);
	if (!branch || branch === "?" || branch === "HEAD") {
		throw new Error(`Draft '${identity}' is not on a branch.`);
	}
	if (branch !== `amend/${slug}`)
		throw new Error(
			`Cannot publish '${identity}': registered worktree branch is '${branch}', expected 'amend/${slug}'.`,
		);

	if (local) {
		ensurePublishCurrency(identity, branch);
		// Merge-strategy publish mutates the shared base repo's main branch —
		// serialize with sync under the coarse lock.
		const merge = withMainLock(() =>
			gitFile(["-C", baseRepo(), "merge", branch, "--squash", "--quiet"]),
		);
		if (merge.exitCode !== 0) {
			throw new Error(
				translatePublishFailure(
					identity,
					branch,
					undefined,
					merge.stderr || merge.stdout,
				),
			);
		}
		const commit = withMainLock(() =>
			gitFile([
				"-C",
				baseRepo(),
				"commit",
				"-m",
				`publish: ${identity}`,
				"--quiet",
			]),
		);
		if (commit.exitCode !== 0) {
			throw new Error(`Merge commit failed: ${commit.stderr || commit.stdout}`);
		}
		console.log(`✓ Published '${identity}' into main.`);
		cleanupDraft(identity, slug, path, branch, binding);
		return;
	}

	const prNum = findOpenPR(remote, branch);
	if (!prNum) {
		throw new Error(
			`No open PR for '${identity}'. Run 'folio proof ${identity}' first to send it for review.`,
		);
	}

	ensurePublishCurrency(identity, branch);

	const merge = gh(
		["pr", "merge", prNum, "--squash", "--delete-branch"],
		remote,
	);
	if (merge.exitCode !== 0) {
		throw new Error(
			translatePublishFailure(
				identity,
				branch,
				prNum,
				merge.stderr || merge.stdout,
			),
		);
	}
	console.log(`✓ Published '${identity}' — PR #${prNum} merged.`);

	// Under pr strategy main follows origin — fast-forward the checkout.
	// This mutates the shared base repo, same as sync — under the lock.
	const ff = withMainLock(() => {
		const checkout = gitFile(
			["-C", baseRepo(), "checkout", "main", "--quiet"],
			{ quiet: true },
		);
		return checkout.exitCode === 0
			? gitFile(
					["-C", baseRepo(), "pull", "--ff-only", "origin", "main", "--quiet"],
					{ quiet: true },
				)
			: checkout;
	});
	if (ff.exitCode !== 0) {
		console.log(
			"  (couldn't fast-forward main from origin — run 'folio status --sync')",
		);
	}

	cleanupDraft(identity, slug, path, branch, binding);
}

// ── drop ───────────────────────────────────────────────────────────

export function cmdDrop(args: string[]): void {
	ensureConfig();
	const { topic: explicit, rest } = extractTopic(args);
	const force = rest.includes("--force");
	const identity = explicit ?? process.env.FOLIO_DRAFT;

	if (!identity) {
		throw new Error(
			`No draft specified. Pass a topic ('${VERB_EXAMPLES.drop}') or set FOLIO_DRAFT.`,
		);
	}

	const qualified = parseQualifiedTopic(identity);
	setBindingContext(qualified.binding);
	const { slug, binding } = qualified;
	const path = registeredAmendmentPath(slug, binding);
	if (!path)
		throw new Error(
			`Refusing to remove '${identity}': no registered worktree on branch amend/${slug}.`,
		);

	if (!worktreeExists(path)) {
		throw new Error(`Draft '${identity}' not found.`);
	}

	const branch = amendmentBranch(path);
	if (branch !== `amend/${slug}`)
		throw new Error(
			`Refusing to remove '${identity}': registered worktree branch is '${branch}', expected 'amend/${slug}'.`,
		);
	const remoteBound = hasRemote();
	const remote = remoteBound ? getRemote() : "";

	// Check for open PR
	let prNum = "";
	if (remoteBound && branch && branch !== "?") {
		const prResult = gh(
			[
				"pr",
				"list",
				"--head",
				branch,
				"--state",
				"open",
				"--json",
				"number",
				"--jq",
				".[0].number",
			],
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
				`  draft '${identity}' has an open draft PR (#${prNum}) and uncommitted changes.`,
			);
		} else {
			console.log(`  draft '${identity}' has an open draft PR (#${prNum}).`);
		}
		console.log(
			"  --force will close the PR, delete the remote branch, and remove local worktree.",
		);
	} else if (dirty) {
		console.log(
			`  draft '${identity}' has uncommitted changes. --force discards them.`,
		);
	} else {
		console.log(`  draft '${identity}' is clean.`);
	}

	if (!force) {
		throw new Error("Use --force to confirm deletion.");
	}

	// Close PR if open
	if (prNum) {
		gh(["pr", "close", prNum], remote);
		console.log(`  Closed PR #${prNum}.`);
	}

	// Delete remote branch
	if (remoteBound && branch && branch !== "?") {
		gitFile(["-C", baseRepo(), "push", "origin", "--delete", branch], {
			quiet: true,
		});
		console.log(`  Deleted remote branch '${branch}'.`);
	}

	// Remove worktree
	const removed = gitFile(
		["-C", baseRepo(), "worktree", "remove", path, "--force"],
		{
			quiet: true,
		},
	);
	if (removed.exitCode !== 0)
		throw new Error(
			`Could not remove registered worktree for '${identity}': ${removed.stderr || removed.stdout}`,
		);

	// Every strategy leaves the amend branch in the bound repository after
	// removing its worktree. Drop --force deliberately discards unmerged work,
	// so remove that local branch as well and allow the topic to be drafted
	// again.
	if (branch && branch !== "?") {
		gitFile(["-C", baseRepo(), "branch", "-D", branch], { quiet: true });
	}
	console.log(`✓ Dropped draft '${identity}'.`);
}

// ── status ─────────────────────────────────────────────────────────

/** `folio status` reports one or all bindings, retaining per-binding failures. */
function statusBinding(
	alias: string,
	binding: Binding,
	sync: boolean,
): boolean {
	setBindingContext(binding);
	console.log(`\n[${alias}] ${binding.path}`);
	if (!mainExists()) {
		console.error(
			`[${alias}] unavailable: checkout is missing or is not a git repository.`,
		);
		return false;
	}
	const remote = binding.github;
	const base = binding.path;
	let fetchFailed = false;
	if (remote) {
		const fetch = fetchMain();
		fetchFailed = fetch.exitCode !== 0;
		if (fetchFailed)
			console.error(
				`[${alias}] fetch failed: ${fetch.stderr || fetch.stdout || "remote unavailable"}`,
			);
	}
	const staleNote = fetchFailed
		? " (couldn't reach remote — showing cached state)"
		: "";
	if (sync && remote && !fetchFailed) {
		const branch = currentBranch();
		if (branch !== "main") {
			console.error(
				`[${alias}] sync failed: checkout is on '${branch}', not main.`,
			);
			return false;
		}
		const behind = behindCount();
		if (behind > 0) {
			const pull = withMainLock(() =>
				gitFile(["-C", base, "pull", "--ff-only", "origin", "main", "--quiet"]),
			);
			if (pull.exitCode !== 0) {
				console.error(`[${alias}] sync failed: ${pull.stderr || pull.stdout}`);
				return false;
			}
			console.log(`  synchronized ${behind} commit(s)`);
		}
	}
	const mainDirty =
		gitFile(["-C", base, "diff", "--quiet", "--", "*.md"], { quiet: true })
			.exitCode !== 0 ||
		gitFile(["-C", base, "diff", "--cached", "--quiet", "--", "*.md"], {
			quiet: true,
		}).exitCode !== 0;
	if (mainDirty) console.log(`  main: unsaved changes`);
	else if (remote && behindCount() > 0)
		console.log(`  main: needs sync${staleNote}`);
	else console.log(`  main: up to date${staleNote}`);

	let drafts: ReturnType<typeof listAmendments>;
	let remoteDrafts: Map<string, { number: string; isDraft: boolean }>;
	let mergedDrafts: Map<string, string>;
	try {
		drafts = listAmendments(binding);
		remoteDrafts = remote
			? listOpenPRMap(remote)
			: new Map<string, { number: string; isDraft: boolean }>();
		mergedDrafts = remote ? listMergedPRMap(remote) : new Map<string, string>();
	} catch (error) {
		console.error(
			`[${alias}] remote status unavailable: ${(error as Error).message}`,
		);
		return false;
	}
	if (drafts.length === 0 && remoteDrafts.size === 0) {
		console.log("  drafts: none");
		return !fetchFailed;
	}
	const seenBranches = new Set<string>();
	for (const draft of drafts.sort((a, b) => a.topic.localeCompare(b.topic))) {
		const branch = `amend/${draft.topic}`;
		seenBranches.add(branch);
		const info = remoteDrafts.get(branch);
		const merged = mergedDrafts.get(branch);
		const state = info
			? `${draft.status} · PR #${info.number} ${info.isDraft ? "draft" : "ready"}`
			: merged
				? `${draft.status} · merged PR #${merged}`
				: draft.status;
		console.log(`  draft ${alias}:${draft.topic} ${state}`);
	}
	for (const [branch, info] of remoteDrafts) {
		if (seenBranches.has(branch)) continue;
		const topic = branch.startsWith("amend/")
			? branch.slice("amend/".length)
			: branch;
		console.log(
			`  draft ${alias}:${topic} unproofed · PR #${info.number} ${
				info.isDraft ? "draft" : "ready"
			}`,
		);
	}
	return !fetchFailed;
}

export function cmdStatus(args: string[] = []): void {
	const aliases = args.filter((arg) => !arg.startsWith("--"));
	const unknownFlags = args.filter(
		(arg) => arg.startsWith("--") && arg !== "--sync",
	);
	if (aliases.length > 1 || unknownFlags.length > 0)
		throw new Error("Usage: folio status [alias] [--sync]");
	const sync = args.includes("--sync");
	if (sync && aliases.length === 0)
		throw new Error("Usage: folio status <binding> --sync");
	ensureConfig();
	const config = loadConfig();
	const selected = Object.entries(config.bindings)
		.filter(([alias]) => !aliases[0] || alias === aliases[0])
		.sort(([a], [b]) => a.localeCompare(b));
	if (aliases[0] && selected.length === 0)
		throw new Error(`Unknown binding '${aliases[0]}'.`);
	let failed = false;
	for (const [alias, binding] of selected)
		if (!statusBinding(alias, binding, sync)) failed = true;
	clearBindingContext();
	if (failed) process.exitCode = 1;
}

// ── config command ────────────────────────────────────────────────

export function cmdConfig(args: string[]): void {
	ensureConfig();

	const key = args[0] as string | undefined;
	const value = args[1] as string | undefined;

	if (!key) {
		console.log(readConfig() || "");
		return;
	}

	if (!value) {
		// Read single key
		const val = readConfig(key as ConfigKey);
		console.log(val || "");
		return;
	}
	if (key !== "skill" && key !== "amendments")
		throw new Error(
			`'${key}' belongs to a binding. Use folio bind/binding commands or edit config.yml.`,
		);
	writeConfig(key as ConfigKey, value);
}

// ── bindings lifecycle ────────────────────────────────────────────

export function cmdBindings(): void {
	ensureConfig();
	const entries = Object.entries(getBindings()).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	if (entries.length === 0) {
		console.log(
			"No bindings. Run 'folio bind <binding> --github <owner/repo>'.",
		);
		return;
	}
	for (const [alias, binding] of entries) {
		console.log(
			`${alias}\t${binding.github ?? "local"}\t${binding.path}\t${binding.strategy}`,
		);
		console.log(`  ${binding.description}`);
	}
}

export function cmdBindingRename(args: string[]): void {
	const oldAlias = args.find((arg) => !arg.startsWith("--"));
	const newAlias = args.filter((arg) => !arg.startsWith("--"))[1];
	if (!oldAlias || !newAlias || !/^[a-z0-9][a-z0-9-]*$/.test(newAlias))
		throw new Error("Usage: folio binding rename <binding> <new-binding>");
	ensureConfig();
	const config = loadConfig();
	const binding = config.bindings[oldAlias];
	if (!binding) throw new Error(`Unknown binding '${oldAlias}'.`);
	if (config.bindings[newAlias])
		throw new Error(`Binding '${newAlias}' already exists.`);
	if (listRegisteredWorktrees(binding).length > 0)
		throw new Error(
			`Cannot rename '${oldAlias}' while it has open amendment worktrees.`,
		);
	delete config.bindings[oldAlias];
	config.bindings[newAlias] = binding;
	saveConfig(config);
	console.log(`✓ Renamed binding '${oldAlias}' to '${newAlias}'.`);
}

export function cmdUnbind(args: string[]): void {
	const alias = args.find((arg) => !arg.startsWith("--"));
	if (!alias) throw new Error("Usage: folio unbind <binding>");
	ensureConfig();
	const config = loadConfig();
	const binding = config.bindings[alias];
	if (!binding) throw new Error(`Unknown binding '${alias}'.`);
	if (listRegisteredWorktrees(binding).length > 0)
		throw new Error(
			`Cannot unbind '${alias}' while it has open amendment worktrees.`,
		);
	delete config.bindings[alias];
	saveConfig(config);
	console.log(`✓ Unbound '${alias}'. Checkout and amendments were preserved.`);
}

// ── map ────────────────────────────────────────────────────────────

export type MapEntry = {
	alias: string;
	description: string;
	index: string;
	available: boolean;
	error?: string;
};

function mapEntries(alias?: string): MapEntry[] {
	const config = loadConfig();
	const selected = Object.entries(config.bindings)
		.filter(([name]) => !alias || name === alias)
		.sort(([a], [b]) => a.localeCompare(b));
	if (alias && selected.length === 0)
		throw new Error(`Unknown binding '${alias}'.`);
	return selected.map(([name, binding]) => {
		const index = join(binding.path, "index.md");
		let available = false;
		let readError = "";
		try {
			available = statSync(index).isFile();
			if (available) readFileSync(index, "utf-8");
		} catch (error) {
			readError = (error as Error).message;
			available = false;
		}
		return {
			alias: name,
			description:
				binding.description || (readIndexDescription(binding.path) ?? ""),
			index,
			available,
			...(available
				? {}
				: { error: readError || "index.md is unavailable or unreadable" }),
		};
	});
}

export function cmdMap(args: string[] = []): void {
	ensureConfig();
	const json = args.includes("--json");
	const aliases = args.filter((arg) => !arg.startsWith("--"));
	if (aliases.length > 1)
		throw new Error("Usage: folio map [<binding>] [--json]");
	const entries = mapEntries(aliases[0]);
	if (json) {
		console.log(JSON.stringify(entries, null, 2));
		return;
	}
	console.log("# Folio map\n");
	if (entries.length === 0) {
		console.log("No bindings configured.");
		return;
	}
	for (const entry of entries) {
		console.log(`- \`${entry.alias}\` — ${entry.description}`);
		console.log(`  index: ${entry.index}`);
		if (!entry.available) console.log(`  unavailable: ${entry.error}`);
	}
}

// ── web ────────────────────────────────────────────────────────────

export function cmdWeb(_args: string[]): void {
	throw new Error("folio web is disabled; use 'folio map' for block routing.");
}

// ── drafts ─────────────────────────────────────────────────────────

export function cmdDrafts(args: string[] = []): void {
	ensureConfig();
	const aliases = args.filter((arg) => !arg.startsWith("--"));
	if (aliases.length > 1 || args.some((arg) => arg.startsWith("--")))
		throw new Error("Usage: folio drafts [alias]");
	const config = loadConfig();
	const selected = Object.entries(config.bindings)
		.filter(([alias]) => !aliases[0] || alias === aliases[0])
		.sort(([a], [b]) => a.localeCompare(b));
	if (aliases[0] && selected.length === 0)
		throw new Error(`Unknown binding '${aliases[0]}'.`);
	let failed = false;
	for (const [alias, binding] of selected) {
		setBindingContext(binding);
		console.log(`${alias}:`);
		if (!mainExists()) {
			console.error(`  ${alias}: unavailable (${binding.path})`);
			failed = true;
			continue;
		}
		let amendments: ReturnType<typeof listAmendments>;
		try {
			amendments = listAmendments(binding);
		} catch (error) {
			console.error(
				`  ${alias}: remote drafts unavailable: ${(error as Error).message}`,
			);
			failed = true;
			continue;
		}
		if (amendments.length === 0) {
			console.log("  No drafts");
			continue;
		}
		for (const amendment of amendments) {
			console.log(
				`  ${amendment.topic.padEnd(30)} ${amendment.status.padEnd(7)} ${amendment.pr || ""}`,
			);
		}
	}
	clearBindingContext();
	if (failed) process.exitCode = 1;
}

// ── lint ───────────────────────────────────────────────────────────

export function cmdLint(args: string[]): void {
	ensureConfig();

	const { topic, rest } = extractTopic(args, ["--spec"]);
	const all = rest.includes("--all");
	const json = rest.includes("--json");
	const strict = rest.includes("--strict");
	const specIdx = rest.indexOf("--spec");
	const spec = specIdx >= 0 ? rest[specIdx + 1] : "folio";
	if (specIdx >= 0 && !spec) {
		throw new Error(
			"Usage: folio lint <binding>|<binding>:<topic>|--all [--spec folio] [--json] [--strict]",
		);
	}
	if ((!topic && !all) || (topic && all)) {
		throw new Error(
			"Specify one binding or qualified draft, or use --all: folio lint <binding> | <binding>:<topic> | --all",
		);
	}

	if (topic) {
		const qualified = topic.includes(":")
			? parseQualifiedTopic(topic)
			: { alias: topic, binding: getBindings()[topic] };
		if (!qualified.binding) throw new Error(`Unknown binding '${topic}'.`);
		setBindingContext(qualified.binding);
		const storeDir = topic.includes(":")
			? registeredAmendmentPath(qualified.slug, qualified.binding)
			: qualified.binding.path;
		if (topic.includes(":") && !storeDir)
			throw new Error(
				`[${qualified.alias}] draft '${topic}' is not a registered amend/${qualified.slug} worktree.`,
			);
		if (!existsSync(`${storeDir}/.git`))
			throw new Error(`[${qualified.alias}] unavailable: store is missing.`);
		const result = lint(storeDir, { spec });
		if (json) console.log(JSON.stringify(result, null, 2));
		else {
			console.log(
				`[${qualified.alias}] ${topic.includes(":") ? "draft" : "main"}`,
			);
			printLintResult(result);
		}
		if (strict && hasLintErrors(result)) process.exitCode = 1;
		clearBindingContext();
		return;
	}

	const results: Array<{ alias: string; result?: unknown; error?: string }> =
		[];
	let failed = false;
	for (const [alias, binding] of Object.entries(getBindings()).sort(
		([a], [b]) => a.localeCompare(b),
	)) {
		setBindingContext(binding);
		if (!existsSync(`${binding.path}/.git`)) {
			const error = "store is missing or unavailable";
			console.error(`[${alias}] unavailable: ${error}`);
			results.push({ alias, error });
			failed = true;
			continue;
		}
		const result = lint(binding.path, { spec });
		results.push({ alias, result });
		if (json) continue;
		console.log(`[${alias}] main`);
		printLintResult(result);
		if (hasLintErrors(result)) failed = true;
	}
	clearBindingContext();
	if (json) console.log(JSON.stringify(results, null, 2));
	if (strict || failed) process.exitCode = 1;
}

// ── update ─────────────────────────────────────────────────────────

/** Bring the installed CLI current, then refresh its matching skill archive. */
export async function cmdUpdate(
	args: string[],
	currentVersion: string,
): Promise<void> {
	const migrated = ensureConfig();
	if (migrated) console.log("Migrated legacy Folio config to named bindings.");
	const result = await updateCli(currentVersion, args);
	if (!result.updated) {
		if (result.available === currentVersion)
			console.log(`Folio ${currentVersion} is up to date.`);
		else if (!process.stdin.isTTY && !args.includes("--yes"))
			console.log(
				`Folio ${currentVersion} → ${result.available}. Re-run in a terminal or use --yes.`,
			);
		else
			console.log(`Folio ${currentVersion} → ${result.available} not applied.`);
		return;
	}

	console.log(`Updated Folio ${result.current} → ${result.available}.`);
	const skillPath = readConfig("skill");
	if (!skillPath) {
		console.log(
			"No installed skill path recorded; run 'folio skill install <path>'.",
		);
		return;
	}
	const executable = process.argv[1];
	const refresh = spawnSync(
		process.execPath,
		[executable, "skill", "install"],
		{ encoding: "utf-8" },
	);
	if (refresh.status === 0) {
		console.log(
			`Skill refreshed at ${skillPath}; global block routing is current.`,
		);
	} else {
		console.log(
			`CLI updated, but skill refresh failed. Run \`folio skill install\`: ${refresh.stderr || refresh.stdout}`,
		);
	}
}

// ── skill ──────────────────────────────────────────────────────────

/**
 * Download the skill archive from the immutable release matching this CLI,
 * then synchronize its files without touching unrelated directory files.
 * Bare `folio skill install` reuses the path recorded under the `skill`
 * config key from a prior install.
 */
const SKILL_MANIFEST = ".folio-skill-manifest.json";
type SkillManifest = { version: 1; files: Record<string, string> };

function skillEnrichmentEnabled(): boolean {
	return readConfig("skill-enrich") !== "false";
}

export function formatSkillRouting(entries: MapEntry[]): string | null {
	if (entries.length === 0) return null;
	return [
		"All Folio blocks are active simultaneously. Use `folio map` to route a request, then read only the selected block index.",
		...entries.map(
			(entry) =>
				`${entry.alias}: ${entry.description} (index: ${entry.index}${entry.available ? "" : "; unavailable"})`,
		),
	].join("\n");
}

function skillRoutingDescription(): string | null {
	return formatSkillRouting(mapEntries());
}

function digest(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function readSkillManifest(path: string): SkillManifest | null {
	const manifest = join(path, SKILL_MANIFEST);
	if (!existsSync(manifest)) return null;
	try {
		const parsed = JSON.parse(readFileSync(manifest, "utf-8")) as SkillManifest;
		return parsed.version === 1 && parsed.files ? parsed : null;
	} catch {
		console.log(
			"  (couldn't read prior Folio skill manifest; preserving stale files)",
		);
		return null;
	}
}

type SkillFile = { content: string; mode: number };

function readSkillArchive(archive: Buffer): Record<string, SkillFile> {
	const temp = mkdtempSync(join(tmpdir(), "folio-skill-"));
	const archivePath = join(temp, "folio-skill.tar.gz");
	const unpacked = join(temp, "unpacked");
	try {
		writeFileSync(archivePath, archive);
		const listing = spawnSync("tar", ["-tzf", archivePath], {
			encoding: "utf-8",
		});
		if (listing.status !== 0)
			throw new Error(`Could not inspect skill archive: ${listing.stderr}`);
		for (const entry of listing.stdout.split("\n")) {
			const path = entry.replace(/^\.\//, "").replace(/\/$/, "");
			if (!path) continue;
			if (path.startsWith("/") || path.split("/").includes(".."))
				throw new Error("Skill archive contains an unsafe path.");
		}
		mkdirSync(unpacked);
		const extracted = spawnSync("tar", ["-xzf", archivePath, "-C", unpacked], {
			encoding: "utf-8",
		});
		if (extracted.status !== 0)
			throw new Error(`Could not unpack skill archive: ${extracted.stderr}`);

		const files: Record<string, SkillFile> = {};
		const visit = (dir: string): void => {
			for (const entry of readdirSync(dir)) {
				const source = join(dir, entry);
				const stat = statSync(source);
				if (stat.isDirectory()) visit(source);
				else if (stat.isFile()) {
					const path = relative(unpacked, source);
					files[path] = {
						content: readFileSync(source, "utf-8"),
						mode: stat.mode & 0o777,
					};
				}
			}
		};
		visit(unpacked);
		if (!files["SKILL.md"])
			throw new Error("Skill archive does not contain SKILL.md.");
		return files;
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}

export async function skillInstall(
	target: string | undefined,
	currentVersion: string,
	enrich: boolean | undefined = undefined,
): Promise<void> {
	ensureConfig();
	if (enrich !== undefined) writeConfig("skill-enrich", String(enrich));
	const shouldEnrich = enrich ?? skillEnrichmentEnabled();
	const recorded = readConfig("skill");
	const resolvedTarget = target ?? recorded;
	if (!resolvedTarget) {
		throw new Error(
			"Usage: folio skill install <path> (no path recorded yet — pass one the first time)",
		);
	}

	const release = await getRelease(currentVersion);
	const archive = await downloadReleaseAsset(release, SKILL_ASSET);
	const bundle = readSkillArchive(archive);
	const abs = resolvePath(resolvedTarget);
	const files = Object.keys(bundle).sort();
	const contents = Object.fromEntries(
		files.map((rel) => [rel, (bundle[rel] as SkillFile).content]),
	);
	contents["SKILL.md"] = enrichDescription(
		contents["SKILL.md"] as string,
		shouldEnrich ? skillRoutingDescription() : null,
	);
	const next: SkillManifest = {
		version: 1,
		files: Object.fromEntries(
			files.map((rel) => [rel, digest(contents[rel] as string)]),
		),
	};
	const previous = readSkillManifest(abs);

	// Remove only an obsolete Folio-managed file that still exactly matches
	// its recorded content. A local edit remains in place and is reported.
	if (previous) {
		for (const [rel, priorHash] of Object.entries(previous.files)) {
			if (next.files[rel]) continue;
			const dest = join(abs, rel);
			if (!existsSync(dest)) continue;
			if (digest(readFileSync(dest, "utf-8")) === priorHash) {
				unlinkSync(dest);
				console.log(`removed obsolete ${rel}`);
			} else {
				console.log(`preserved modified obsolete ${rel}`);
			}
		}
	}

	for (const rel of files) {
		const dest = join(abs, rel);
		mkdirSync(dirname(dest), { recursive: true });
		const file = bundle[rel] as SkillFile;
		writeFileSync(dest, contents[rel] as string, "utf-8");
		chmodSync(dest, file.mode);
		console.log(`wrote ${rel}`);
	}

	mkdirSync(abs, { recursive: true });
	const manifest = join(abs, SKILL_MANIFEST);
	const pending = `${manifest}.${process.pid}.tmp`;
	writeFileSync(pending, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
	renameSync(pending, manifest);
	writeConfig("skill", abs);

	console.log(`\n${files.length} file(s) synchronized to ${abs}`);
}

export async function cmdSkill(
	args: string[],
	currentVersion: string,
): Promise<void> {
	const [sub, ...rest] = args;

	if (sub === "install") {
		const noEnrich = rest.includes("--no-enrich");
		const enrich = rest.includes("--enrich");
		if (noEnrich && enrich)
			throw new Error("--enrich and --no-enrich are mutually exclusive.");
		const target = rest.find((arg) => !arg.startsWith("--"));
		await skillInstall(
			target,
			currentVersion,
			noEnrich ? false : enrich || undefined,
		);
		return;
	}

	throw new Error("Usage: folio skill install [path] [--enrich|--no-enrich]");
}
