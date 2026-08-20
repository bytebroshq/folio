import { execSync, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import {
	AMEND_DIR,
	type Binding,
	baseRepo,
	bindingAmendmentsPath,
	getPath,
	getRemote,
	getStrategy,
	hasRemote,
} from "./config";

// ── Shell ──────────────────────────────────────────────────────────

export function run(
	cmd: string,
	opts?: { cwd?: string; quiet?: boolean },
): { stdout: string; stderr: string; exitCode: number } {
	try {
		const result = execSync(cmd, {
			encoding: "utf-8",
			cwd: opts?.cwd,
			stdio: opts?.quiet ? "pipe" : "pipe",
			maxBuffer: 1024 * 1024,
		});
		return {
			stdout: (result || "").trim(),
			stderr: "",
			exitCode: 0,
		};
	} catch (err: unknown) {
		const e = err as {
			status?: number;
			stdout?: string;
			stderr?: string;
			message?: string;
		};
		return {
			stdout: (e.stdout || "").toString().trim(),
			stderr: (e.stderr || "").toString().trim(),
			exitCode: e.status ?? 1,
		};
	}
}

/** Run a command with argv boundaries preserved; never invoke a shell. */
export function runFile(
	command: string,
	args: string[],
	opts?: { cwd?: string; quiet?: boolean },
): { stdout: string; stderr: string; exitCode: number } {
	const result = spawnSync(command, args, {
		encoding: "utf-8",
		cwd: opts?.cwd,
		stdio: "pipe",
		maxBuffer: 1024 * 1024,
	});
	return {
		stdout: (result.stdout || "").toString().trim(),
		stderr: (result.stderr || result.error?.message || "").toString().trim(),
		exitCode: result.status ?? 1,
	};
}

export function gh(
	args: string[],
	remote?: string,
): { stdout: string; stderr: string; exitCode: number } {
	const repo = remote ?? getRemote();
	return runFile("gh", [...args, "--repo", repo], { quiet: true });
}

export function gitFile(
	args: string[],
	opts?: { cwd?: string; quiet?: boolean },
): { stdout: string; stderr: string; exitCode: number } {
	return runFile("git", args, opts);
}

export type CommandResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

// ── Base repo ──────────────────────────────────────────────────────

/**
 * The ref amendments branch from and rebase onto.
 * Merge strategy has no origin; main is the local branch itself.
 */
export function mainRef(): string {
	return getStrategy() === "merge" ? "main" : "origin/main";
}

export function ensureBase(remote?: string): void {
	const path = getPath();
	if (path) {
		if (!existsSync(`${path}/.git`)) {
			// A remote-backed checkout at a custom path can be recreated.
			const repo = remote ?? getRemote();
			if (!repo) {
				throw new Error(
					`Bound local folio missing at ${path}. Re-run 'folio bind <path>'.`,
				);
			}
			console.log(`Recreating checkout of ${repo} at ${path}...`);
			const r = gitFile([
				"clone",
				"--quiet",
				`git@github.com:${repo}.git`,
				path,
			]);
			if (r.exitCode !== 0) {
				throw new Error(
					`Failed to clone ${repo} into ${path}. Check access and try again.`,
				);
			}
		}
		gitFile(["-C", path, "config", "extensions.worktreeConfig", "true"], {
			quiet: true,
		});
		return;
	}

	const repo = remote ?? getRemote();

	if (existsSync(`${baseRepo()}/.git`)) {
		// Base exists — fetch is caller's responsibility when needed.
		return;
	}

	console.log("Initializing shared clone...");
	const r = gitFile([
		"clone",
		"--quiet",
		`git@github.com:${repo}.git`,
		baseRepo(),
	]);
	if (r.exitCode !== 0) {
		throw new Error(`Failed to clone ${repo}. Check access and try again.`);
	}
	gitFile(["-C", baseRepo(), "config", "extensions.worktreeConfig", "true"], {
		quiet: true,
	});
}

export function mainExists(): boolean {
	return existsSync(`${baseRepo()}/.git`);
}

export function fetchMain(): CommandResult {
	if (!hasRemote()) return { stdout: "", stderr: "", exitCode: 0 };
	return gitFile(["-C", baseRepo(), "fetch", "origin", "main", "--quiet"], {
		quiet: true,
	});
}

export function currentBranch(): string {
	return gitFile(["-C", baseRepo(), "rev-parse", "--abbrev-ref", "HEAD"], {
		quiet: true,
	}).stdout;
}

export function behindCount(): number {
	if (!hasRemote()) return 0;
	const result = gitFile(
		["-C", baseRepo(), "rev-list", "--count", "main..origin/main"],
		{ quiet: true },
	);
	return Number.parseInt(result.stdout || "0", 10);
}

/** Parse a repo's `origin` URL for a GitHub owner/repo, if any. */
export function parseGitHubOrigin(repoPath: string): string | null {
	const url = gitFile(["-C", repoPath, "remote", "get-url", "origin"], {
		quiet: true,
	}).stdout;
	const match = url.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
	return match ? match[1] : null;
}

/** Whether an amendment branch has been merged into main. */
export function isMergedToMain(branch: string): boolean {
	fetchMain();
	const merge = getStrategy() === "merge";
	const needle = merge ? branch : `origin/${branch}`;
	return gitFile(
		[
			"-C",
			baseRepo(),
			"branch",
			...(merge ? [] : ["-r"]),
			"--merged",
			mainRef(),
		],
		{ quiet: true },
	)
		.stdout.split(/\r?\n/)
		.some(
			(line) => line.trim() === needle || line.trim().endsWith(`/${needle}`),
		);
}

// ── Amendment helpers ──────────────────────────────────────────────

export function amendmentBranch(path: string): string {
	const result = gitFile(["-C", path, "rev-parse", "--abbrev-ref", "HEAD"], {
		quiet: true,
	});
	return result.exitCode === 0 ? result.stdout : "?";
}

export function isDirty(path: string): boolean {
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

export function worktreeExists(path: string): boolean {
	return existsSync(`${path}/.git`);
}

/**
 * Batch-fetch open PRs for a set of branch names.
 * Returns a Map<headRefName, {number, isDraft}> — one gh call instead of N.
 */
export function listOpenPRMap(
	remote: string,
): Map<string, { number: string; isDraft: boolean }> {
	const map = new Map<string, { number: string; isDraft: boolean }>();

	// List all open PRs and match client-side. "@" is used as separator
	// because it cannot appear in Git branch names or PR numbers/booleans.
	const result = gh(
		[
			"pr",
			"list",
			"--state",
			"open",
			"--json",
			"number,headRefName,isDraft",
			"--jq",
			'.[] | .headRefName + "@" + (.number|tostring) + "@" + (.isDraft|tostring)',
		],
		remote,
	);
	if (result.exitCode !== 0)
		throw new Error(
			result.stderr || result.stdout || `Could not list PRs for ${remote}.`,
		);
	if (!result.stdout) return map;

	for (const line of result.stdout.split("\n")) {
		const draftSep = line.lastIndexOf("@");
		if (draftSep === -1) continue;
		const isDraftStr = line.slice(draftSep + 1);
		const head = line.slice(0, draftSep);

		const numSep = head.lastIndexOf("@");
		if (numSep === -1) continue;
		const branch = head.slice(0, numSep);
		const num = head.slice(numSep + 1);

		if (branch && num) {
			map.set(branch, { number: num, isDraft: isDraftStr === "true" });
		}
	}
	return map;
}

/**
 * Batch-fetch recently merged PRs by head branch. A squash merge does not
 * preserve branch ancestry, so this is the authoritative signal for a stale
 * local draft whose PR has already landed.
 */
export function listMergedPRMap(remote: string): Map<string, string> {
	const map = new Map<string, string>();
	const result = gh(
		[
			"pr",
			"list",
			"--state",
			"merged",
			"--limit",
			"100",
			"--json",
			"number,headRefName",
			"--jq",
			'.[] | .headRefName + "@" + (.number|tostring)',
		],
		remote,
	);
	if (result.exitCode !== 0)
		throw new Error(
			result.stderr ||
				result.stdout ||
				`Could not list merged PRs for ${remote}.`,
		);
	if (!result.stdout) return map;

	for (const line of result.stdout.split("\n")) {
		const separator = line.lastIndexOf("@");
		if (separator === -1) continue;
		const branch = line.slice(0, separator);
		const number = line.slice(separator + 1);
		if (branch && number) map.set(branch, number);
	}
	return map;
}

export function listAmendments(binding: Binding): {
	topic: string;
	status: string;
	pr?: string;
	prNumber?: string;
	prDraft?: boolean;
}[] {
	const results: {
		topic: string;
		status: string;
		pr?: string;
		prNumber?: string;
		prDraft?: boolean;
	}[] = [];
	const worktrees = listRegisteredWorktrees(binding);
	if (worktrees.length === 0) return results;

	const remote = binding.github;

	// Collect branch names first, then batch-fetch PRs in one gh call.
	const topicBranches = new Map(
		worktrees.map((worktree) => [worktree.topic, worktree.branch]),
	);

	const prMap = remote
		? listOpenPRMap(remote)
		: new Map<string, { number: string; isDraft: boolean }>();

	for (const worktree of worktrees) {
		const { topic, path } = worktree;
		const dirty = isDirty(path);
		const status = dirty ? "dirty" : "clean";

		let pr: string | undefined;
		let prNumber: string | undefined;
		let prDraft: boolean | undefined;
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

export type RegisteredWorktree = {
	path: string;
	topic: string;
	branch: string;
};

/** Only worktrees registered in this binding repository can be amendments. */
export function listRegisteredWorktrees(
	binding: Binding,
): RegisteredWorktree[] {
	const result = gitFile(
		["-C", binding.path, "worktree", "list", "--porcelain"],
		{ quiet: true },
	);
	if (result.exitCode !== 0) return [];
	const normalize = (value: string): string => {
		try {
			return realpathSync(value);
		} catch {
			return resolve(value);
		}
	};
	const owned = normalize(bindingAmendmentsPath(binding));
	const legacyRoot = normalize(resolveLegacyRoot());
	const records: RegisteredWorktree[] = [];
	let path = "";
	for (const line of `${result.stdout}\n`.split(/\r?\n/)) {
		if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
		if (line === "" && path) {
			const normalized = normalize(path.replace(/\/$/, ""));
			const isOwned =
				normalized.startsWith(`${owned}/`) ||
				normalized.startsWith(`${legacyRoot}/`);
			if (isOwned) {
				const topic = normalized.slice(normalized.lastIndexOf("/") + 1);
				const branch = amendmentBranch(normalized);
				if (topic && branch !== "?")
					records.push({ path: normalized, topic, branch });
			}
			path = "";
		}
	}
	return records;
}

export function registeredAmendmentPath(
	topic: string,
	binding: Binding,
): string | null {
	return (
		listRegisteredWorktrees(binding).find(
			(worktree) =>
				worktree.topic === topic && worktree.branch === `amend/${topic}`,
		)?.path ?? null
	);
}

function resolveLegacyRoot(): string {
	return resolve(AMEND_DIR);
}

export function ensureGh(): void {
	const r = runFile("gh", ["--version"], { quiet: true });
	if (r.exitCode !== 0) {
		throw new Error("gh CLI not found. Install from https://cli.github.com");
	}
}

export function listOpenPRs(remote: string): string[] {
	const result = gh(
		[
			"pr",
			"list",
			"--state",
			"open",
			"--json",
			"number,title,headRefName",
			"--jq",
			'.[] | "#\\(.number)  \\(.title)  (\\(.headRefName))"',
		],
		remote,
	);
	if (!result.stdout) return [];
	return result.stdout.split("\n");
}
