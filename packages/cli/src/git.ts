import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
	AMEND_DIR,
	BASE_REPO,
	baseRepo,
	getRemote,
	getSource,
	isLocal,
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
 * Local mode has no origin; main is the local branch itself.
 */
export function mainRef(): string {
	return isLocal() ? "main" : "origin/main";
}

export function ensureBase(remote?: string): void {
	const source = getSource();
	if (source) {
		if (!existsSync(`${source}/.git`)) {
			throw new Error(
				`Bound local folio missing at ${source}. Re-run 'folio bind <path>'.`,
			);
		}
		run(`git -C "${source}" config extensions.worktreeConfig true`, {
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
	if (isLocal()) return;
	run(`git -C "${BASE_REPO}" fetch origin main --quiet`, { quiet: true });
}

export function currentBranch(): string {
	return run(`git -C "${baseRepo()}" rev-parse --abbrev-ref HEAD`, {
		quiet: true,
	}).stdout;
}

export function behindCount(): number {
	if (isLocal()) return 0;
	const result = run(
		`git -C "${BASE_REPO}" rev-list --count HEAD..origin/main 2>/dev/null || echo 0`,
		{ quiet: true },
	);
	return Number.parseInt(result.stdout || "0", 10);
}

/** Whether an amendment branch has been merged into main. */
export function isMergedToMain(branch: string): boolean {
	fetchMain();
	const flag = isLocal() ? "" : "-r ";
	const needle = isLocal() ? branch : `origin/${branch}`;
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
 * Returns a Map<headRefName, PR number> — one gh call instead of N.
 */
function batchPRs(remote: string): Map<string, string> {
	const map = new Map<string, string>();

	// List all open PRs and match client-side.  "@" is used as separator
	// because it cannot appear in Git branch names or PR numbers.
	const result = gh(
		`pr list --state open --json number,headRefName --jq '.[] | .headRefName + "@" + (.number|tostring)'`,
		remote,
	);
	if (!result.stdout) return map;

	for (const line of result.stdout.split("\n")) {
		const sep = line.lastIndexOf("@");
		if (sep === -1) continue;
		const branch = line.slice(0, sep);
		const num = line.slice(sep + 1);
		if (branch && num) map.set(branch, num);
	}
	return map;
}

export function listAmendments(): {
	topic: string;
	status: string;
	pr?: string;
}[] {
	const results: { topic: string; status: string; pr?: string }[] = [];
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

	const prMap = remote ? batchPRs(remote) : new Map<string, string>();

	for (const topic of topics) {
		const path = `${AMEND_DIR}/${topic}`;
		const dirty = isDirty(path);
		const status = dirty ? "dirty" : "clean";

		let pr: string | undefined;
		const branch = topicBranches.get(topic);
		if (branch) {
			const prNum = prMap.get(branch);
			if (prNum) pr = `PR #${prNum}`;
		}

		results.push({ topic, status, pr });
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
