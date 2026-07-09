import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
	AMEND_DIR,
	BASE_REPO,
	baseRepo,
	getPath,
	getRemote,
	getStrategy,
	hasRemote,
	readConfig,
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

export function gh(
	args: string,
	remote?: string,
): { stdout: string; stderr: string; exitCode: number } {
	const repo = remote ?? getRemote();
	return run(`gh ${args} --repo "${repo}"`, { quiet: true });
}

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
			const repo = remote ?? readConfig("remote");
			if (!repo) {
				throw new Error(
					`Bound local folio missing at ${path}. Re-run 'folio bind <path>'.`,
				);
			}
			console.log(`Recreating checkout of ${repo} at ${path}...`);
			const r = run(`git clone --quiet git@github.com:${repo}.git "${path}"`);
			if (r.exitCode !== 0) {
				throw new Error(
					`Failed to clone ${repo} into ${path}. Check access and try again.`,
				);
			}
		}
		run(`git -C "${path}" config extensions.worktreeConfig true`, {
			quiet: true,
		});
		return;
	}

	const repo = remote ?? getRemote();

	if (existsSync(`${BASE_REPO}/.git`)) {
		// Base exists — fetch is caller's responsibility when needed.
		return;
	}

	console.log("Initializing shared clone...");
	const r = run(`git clone --quiet git@github.com:${repo}.git "${BASE_REPO}"`);
	if (r.exitCode !== 0) {
		throw new Error(`Failed to clone ${repo}. Check access and try again.`);
	}
	run(`git -C "${BASE_REPO}" config extensions.worktreeConfig true`, {
		quiet: true,
	});
}

export function mainExists(): boolean {
	return existsSync(`${baseRepo()}/.git`);
}

export function fetchMain(): void {
	if (!hasRemote()) return;
	run(`git -C "${baseRepo()}" fetch origin main --quiet`, { quiet: true });
}

export function currentBranch(): string {
	return run(`git -C "${baseRepo()}" rev-parse --abbrev-ref HEAD`, {
		quiet: true,
	}).stdout;
}

export function behindCount(): number {
	if (!hasRemote()) return 0;
	const result = run(
		`git -C "${baseRepo()}" rev-list --count HEAD..origin/main 2>/dev/null || echo 0`,
		{ quiet: true },
	);
	return Number.parseInt(result.stdout || "0", 10);
}

/** Parse a repo's `origin` URL for a GitHub owner/repo, if any. */
export function parseGitHubOrigin(repoPath: string): string | null {
	const url = run(`git -C "${repoPath}" remote get-url origin 2>/dev/null`, {
		quiet: true,
	}).stdout;
	const match = url.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
	return match ? match[1] : null;
}

/** Whether an amendment branch has been merged into main. */
export function isMergedToMain(branch: string): boolean {
	fetchMain();
	const merge = getStrategy() === "merge";
	const flag = merge ? "" : "-r ";
	const needle = merge ? branch : `origin/${branch}`;
	return (
		run(
			`git -C "${baseRepo()}" branch ${flag}--merged ${mainRef()} 2>/dev/null | grep -q "${needle}" && echo yes || echo no`,
			{ quiet: true },
		).stdout === "yes"
	);
}

// ── Amendment helpers ──────────────────────────────────────────────

export function amendmentBranch(path: string): string {
	return (
		run(`git -C "${path}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""`, {
			quiet: true,
		}).stdout || "?"
	);
}

export function isDirty(path: string): boolean {
	const diff = run(`git -C "${path}" diff --quiet 2>/dev/null || echo dirty`, {
		quiet: true,
	}).stdout;
	const cached = run(
		`git -C "${path}" diff --cached --quiet 2>/dev/null || echo dirty`,
		{ quiet: true },
	).stdout;
	const untracked = run(
		`git -C "${path}" ls-files --others --exclude-standard 2>/dev/null`,
		{ quiet: true },
	).stdout;
	return diff !== "" || cached !== "" || untracked !== "";
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
		`pr list --state open --json number,headRefName,isDraft --jq '.[] | .headRefName + "@" + (.number|tostring) + "@" + (.isDraft|tostring)'`,
		remote,
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

export function listAmendments(): {
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
	const { exitCode } = run(`ls "${AMEND_DIR}" 2>/dev/null`, { quiet: true });
	if (exitCode !== 0) return results;

	const { stdout } = run(`ls -1 "${AMEND_DIR}" 2>/dev/null`, { quiet: true });
	if (!stdout) return results;

	const remote = readConfig("remote");

	// Collect branch names first, then batch-fetch PRs in one gh call.
	const topics: string[] = [];
	const topicBranches: Map<string, string> = new Map();

	for (const topic of stdout.split("\n")) {
		if (!topic) continue;
		const path = `${AMEND_DIR}/${topic}`;
		if (!existsSync(path)) continue;

		const branch = amendmentBranch(path);
		if (branch && branch !== "?") topicBranches.set(topic, branch);
		topics.push(topic);
	}

	const prMap = remote
		? listOpenPRMap(remote)
		: new Map<string, { number: string; isDraft: boolean }>();

	for (const topic of topics) {
		const path = `${AMEND_DIR}/${topic}`;
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

export function ensureGh(): void {
	const r = run("which gh 2>/dev/null", { quiet: true });
	if (r.exitCode !== 0) {
		throw new Error("gh CLI not found. Install from https://cli.github.com");
	}
}

export function listOpenPRs(remote: string): string[] {
	const result = gh(
		`pr list --state open --json number,title,headRefName --jq '.[] | "#\\(.number)  \\(.title)  (\\(.headRefName))"'`,
		remote,
	);
	if (!result.stdout) return [];
	return result.stdout.split("\n");
}
