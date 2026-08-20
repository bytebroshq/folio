import { afterEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	formatSkillRouting,
	proofMessage,
	proofMetadataAction,
} from "./commands";
import { runFile } from "./git";

const homes: string[] = [];

function runCli(args: string[]) {
	const home = mkdtempSync(join(tmpdir(), "folio-cli-help-"));
	homes.push(home);
	return runCliAtHome(args, home);
}

function runCliAtHome(
	args: string[],
	home: string,
	extraEnv: Record<string, string> = {},
) {
	return Bun.spawnSync(
		[process.execPath, join(import.meta.dir, "index.ts"), ...args],
		{
			cwd: import.meta.dir,
			env: {
				...process.env,
				HOME: home,
				FOLIO_HOME: join(home, ".config", "folio"),
				...extraEnv,
			},
			stdout: "pipe",
			stderr: "pipe",
		},
	);
}

function output(result: ReturnType<typeof runCli>): string {
	return new TextDecoder().decode(result.stdout);
}

function error(result: ReturnType<typeof runCli>): string {
	return new TextDecoder().decode(result.stderr);
}

afterEach(() => {
	for (const home of homes.splice(0))
		rmSync(home, { recursive: true, force: true });
});

describe("command help", () => {
	test("root help documents binding names and descriptions", () => {
		const result = runCli(["--help"]);
		expect(result.exitCode).toBe(0);
		expect(output(result)).toContain(
			"folio bind <binding> --github <owner/repo> [--path <path>] [--description <text>]",
		);
		expect(output(result)).toContain(
			"folio create <binding> --path <path> [--description <text>]",
		);
		expect(output(result)).toContain("A binding is a short, unique name");
	});

	test.each([
		["bind"],
		["create"],
		["draft"],
		["proof"],
		["publish"],
		["drop"],
		["map"],
		["bindings"],
		["drafts"],
		["status"],
		["update"],
		["config"],
		["web"],
		["lint"],
		["skill"],
		["skill", "install"],
	])("%s --help is command-specific and side-effect free", (...command) => {
		const result = runCli([...command, "--help"]);
		expect(result.exitCode).toBe(0);
		expect(output(result)).toStartWith(`Usage: folio ${command.join(" ")}`);
		const home = homes.at(-1) as string;
		expect(existsSync(join(home, ".config", "folio"))).toBe(false);
	});

	test("-h is an alias", () => {
		const result = runCli(["draft", "-h"]);
		expect(result.exitCode).toBe(0);
		expect(output(result)).toStartWith("Usage: folio draft");
	});

	test("a help-shaped proof message is not intercepted", () => {
		const result = runCli(["proof", "topic", "-m", "--help"]);
		expect(result.exitCode).toBe(1);
		expect(output(result)).not.toContain("Usage:");
		expect(error(result)).toContain("must be qualified");
	});
});

describe("multi-binding configuration and lifecycle", () => {
	function localBlock(label: string): string {
		const repo = mkdtempSync(join(tmpdir(), `folio-${label}-`));
		writeFileSync(
			join(repo, "index.md"),
			`---\ndescription: ${label} knowledge\n---\n# Index\n`,
			"utf-8",
		);
		mkdirSync(join(repo, "leaves"), { recursive: true });
		expect(runFile("git", ["init", "-b", "main", repo]).exitCode).toBe(0);
		expect(
			runFile("git", ["-C", repo, "config", "user.email", "test@example.com"])
				.exitCode,
		).toBe(0);
		expect(
			runFile("git", ["-C", repo, "config", "user.name", "Test"]).exitCode,
		).toBe(0);
		expect(runFile("git", ["-C", repo, "add", "index.md"]).exitCode).toBe(0);
		expect(runFile("git", ["-C", repo, "commit", "-m", "init"]).exitCode).toBe(
			0,
		);
		return repo;
	}

	test("binds a local block without switching or deleting existing state", () => {
		const home = mkdtempSync(join(tmpdir(), "folio-cli-home-"));
		homes.push(home);
		const repo = mkdtempSync(join(tmpdir(), "folio-block-"));
		writeFileSync(
			join(repo, "index.md"),
			"---\ndescription: Personal notes\n---\n# Index\n",
			"utf-8",
		);
		expect(runFile("git", ["init", "-b", "main", repo]).exitCode).toBe(0);
		expect(
			runFile("git", ["-C", repo, "config", "user.email", "test@example.com"])
				.exitCode,
		).toBe(0);
		expect(
			runFile("git", ["-C", repo, "config", "user.name", "Test"]).exitCode,
		).toBe(0);
		expect(runFile("git", ["-C", repo, "add", "index.md"]).exitCode).toBe(0);
		expect(runFile("git", ["-C", repo, "commit", "-m", "init"]).exitCode).toBe(
			0,
		);

		const bound = runCliAtHome(["bind", "personal", "--path", repo], home);
		expect(bound.exitCode).toBe(0);
		expect(
			runFile("git", [
				"-C",
				repo,
				"config",
				"--get",
				"extensions.worktreeConfig",
			]).stdout,
		).toBe("true");
		const configPath = join(home, ".config", "folio", "config.yml");
		const config = readFileSync(configPath, "utf-8");
		const id = config.match(/^\s+id: "(bnd_[0-9a-f]+)"$/m)?.[1] as string;
		expect(config).toContain("version: 2");
		expect(config).toContain("personal:");
		expect(config).toContain('description: "Personal notes"');

		const draft = runCliAtHome(["draft", "personal:kept-topic"], home);
		expect(draft.exitCode).toBe(0);
		const amendment = join(
			home,
			".config",
			"folio",
			"stores",
			"amendments",
			id,
			"kept-topic",
		);
		expect(existsSync(amendment)).toBe(true);
		const renameWhileOpen = runCliAtHome(
			["binding", "rename", "personal", "notes"],
			home,
		);
		expect(renameWhileOpen.exitCode).not.toBe(0);
		expect(runCliAtHome(["unbind", "personal"], home).exitCode).not.toBe(0);
		expect(
			runCliAtHome(["drop", "personal:kept-topic", "--force"], home).exitCode,
		).toBe(0);
		const renamed = runCliAtHome(
			["binding", "rename", "personal", "notes"],
			home,
		);
		expect(renamed.exitCode).toBe(0);
		const renamedConfig = readFileSync(configPath, "utf-8");
		expect(renamedConfig).toContain("notes:");
		expect(renamedConfig).toContain(`id: "${id}"`);
		mkdirSync(amendment, { recursive: true });
		const unbound = runCliAtHome(["unbind", "notes"], home);
		expect(unbound.exitCode).toBe(0);
		expect(readFileSync(configPath, "utf-8")).not.toContain("notes:");
		expect(existsSync(amendment)).toBe(true);
		expect(existsSync(join(repo, ".git"))).toBe(true);
		rmSync(repo, { recursive: true, force: true });
	});

	test("rejects duplicate and mismatched GitHub bindings before adoption", () => {
		const home = mkdtempSync(join(tmpdir(), "folio-cli-home-"));
		homes.push(home);
		const repo = localBlock("github");
		expect(
			runFile("git", [
				"-C",
				repo,
				"remote",
				"add",
				"origin",
				"git@github.com:Owner/Repo.git",
			]).exitCode,
		).toBe(0);
		expect(
			runCliAtHome(
				["bind", "first", "--github", "Owner/Repo", "--path", repo],
				home,
			).exitCode,
		).toBe(0);

		const managedDuplicate = join(
			home,
			".config",
			"folio",
			"stores",
			"bindings",
			"second",
		);
		const duplicate = runCliAtHome(
			["bind", "second", "--github", "owner/repo"],
			home,
		);
		expect(duplicate.exitCode).not.toBe(0);
		expect(error(duplicate)).toContain("already bound as 'first'");
		expect(existsSync(managedDuplicate)).toBe(false);

		const other = localBlock("other-github");
		expect(
			runFile("git", [
				"-C",
				other,
				"remote",
				"add",
				"origin",
				"git@github.com:someone/else.git",
			]).exitCode,
		).toBe(0);
		const mismatch = runCliAtHome(
			["bind", "wrong", "--github", "owner/wanted", "--path", other],
			home,
		);
		expect(mismatch.exitCode).not.toBe(0);
		expect(error(mismatch)).toContain("is not a checkout of 'owner/wanted'");

		rmSync(repo, { recursive: true, force: true });
		rmSync(other, { recursive: true, force: true });
	});

	test("maps every block and requires qualified, binding-scoped draft identities", () => {
		const home = mkdtempSync(join(tmpdir(), "folio-cli-home-"));
		homes.push(home);
		const personal = localBlock("personal");
		const operations = localBlock("operations");
		expect(
			runCliAtHome(["bind", "personal", "--path", personal], home).exitCode,
		).toBe(0);
		expect(
			runCliAtHome(["bind", "ops", "--path", operations], home).exitCode,
		).toBe(0);

		const map = runCliAtHome(["map"], home);
		expect(map.exitCode).toBe(0);
		expect(output(map)).toContain("`ops`");
		expect(output(map)).toContain("`personal`");
		expect(output(map)).toContain(join(personal, "index.md"));
		const json = runCliAtHome(["map", "--json"], home);
		expect(json.exitCode).toBe(0);
		const entries = JSON.parse(output(json)) as Array<{
			alias: string;
			index: string;
		}>;
		expect(entries.map((entry) => entry.alias)).toEqual(["ops", "personal"]);

		const unqualified = runCliAtHome(["draft", "shared-topic"], home);
		expect(unqualified.exitCode).toBe(1);
		expect(error(unqualified)).toContain("must be qualified");

		const personalDraft = runCliAtHome(
			["draft", "personal:shared-topic"],
			home,
		);
		expect(personalDraft.exitCode).toBe(0);
		const crossBinding = runCliAtHome(["proof", "ops:shared-topic"], home);
		expect(crossBinding.exitCode).toBe(1);
		expect(error(crossBinding)).toContain(
			"Worktree for 'ops:shared-topic' not found",
		);
		const operationsDraft = runCliAtHome(["draft", "ops:shared-topic"], home);
		expect(operationsDraft.exitCode).toBe(0);

		const config = readFileSync(
			join(home, ".config", "folio", "config.yml"),
			"utf-8",
		);
		const ids = [...config.matchAll(/^\s+id: "(bnd_[0-9a-f]+)"$/gm)].map(
			(match) => match[1],
		);
		expect(ids).toHaveLength(2);
		for (const id of ids)
			expect(
				existsSync(
					join(
						home,
						".config",
						"folio",
						"stores",
						"amendments",
						id,
						"shared-topic",
					),
				),
			).toBe(true);
		rmSync(personal, { recursive: true, force: true });
		rmSync(operations, { recursive: true, force: true });
	});

	test("disables the obsolete web command", () => {
		const result = runCli(["web"]);
		expect(result.exitCode).toBe(1);
		expect(error(result)).toContain("folio web is disabled");
	});

	test("continues aggregate inventory and lint across an unavailable binding", () => {
		const home = mkdtempSync(join(tmpdir(), "folio-cli-home-"));
		homes.push(home);
		const personal = localBlock("personal");
		const unavailable = localBlock("unavailable");
		expect(
			runCliAtHome(["bind", "personal", "--path", personal], home).exitCode,
		).toBe(0);
		expect(
			runCliAtHome(["bind", "ops", "--path", unavailable], home).exitCode,
		).toBe(0);
		rmSync(unavailable, { recursive: true, force: true });

		const drafts = runCliAtHome(["drafts"], home);
		expect(drafts.exitCode).toBe(1);
		expect(output(drafts)).toContain("personal:");
		expect(error(drafts)).toContain("ops: unavailable");
		const status = runCliAtHome(["status"], home);
		expect(status.exitCode).toBe(1);
		expect(output(status)).toContain("[personal]");
		expect(error(status)).toContain("[ops] unavailable");
		const lint = runCliAtHome(["lint", "--all"], home);
		expect(lint.exitCode).toBe(1);
		expect(output(lint)).toContain("[personal] main");
		expect(error(lint)).toContain("[ops] unavailable");
		rmSync(personal, { recursive: true, force: true });
	});

	test("requires explicit lint scope and keeps targeted JSON unwrapped", () => {
		const home = mkdtempSync(join(tmpdir(), "folio-cli-home-"));
		homes.push(home);
		const personal = localBlock("personal");
		const operations = localBlock("operations");
		expect(
			runCliAtHome(["bind", "personal", "--path", personal], home).exitCode,
		).toBe(0);
		expect(
			runCliAtHome(["bind", "ops", "--path", operations], home).exitCode,
		).toBe(0);

		const missing = runCliAtHome(["lint"], home);
		expect(missing.exitCode).toBe(1);
		expect(error(missing)).toContain("Specify one binding");
		const ambiguous = runCliAtHome(["lint", "personal", "--all"], home);
		expect(ambiguous.exitCode).toBe(1);

		const targeted = runCliAtHome(["lint", "personal", "--json"], home);
		expect(targeted.exitCode).toBe(0);
		const direct = JSON.parse(output(targeted)) as Record<string, unknown>;
		expect(direct).toHaveProperty("spec");
		expect(direct).toHaveProperty("issues");
		expect(direct).not.toHaveProperty("alias");
		expect(direct).not.toHaveProperty("result");

		const aggregate = runCliAtHome(["lint", "--all", "--json"], home);
		expect(aggregate.exitCode).toBe(0);
		const entries = JSON.parse(output(aggregate)) as Array<{
			alias: string;
			result: unknown;
		}>;
		expect(entries.map((entry) => entry.alias)).toEqual(["ops", "personal"]);
		expect(entries.every((entry) => "result" in entry)).toBe(true);

		rmSync(personal, { recursive: true, force: true });
		rmSync(operations, { recursive: true, force: true });
	});

	test("bootstraps a legacy config through the command/update entry path", () => {
		const home = mkdtempSync(join(tmpdir(), "folio-cli-home-"));
		homes.push(home);
		const repo = localBlock("legacy");
		const configDir = join(home, ".config", "folio");
		mkdirSync(configDir, { recursive: true });
		writeFileSync(
			join(configDir, "config.yml"),
			`source: ${repo}\nstore: git\nstrategy: merge\n`,
			"utf-8",
		);
		const result = runCliAtHome(["config"], home);
		expect(result.exitCode).toBe(0);
		expect(output(result)).toContain("version: 2");
		expect(output(result)).toContain(
			"Migrated legacy Folio config to named bindings:",
		);
		expect(output(result)).toContain("alias: folio-legacy-");
		expect(output(result)).toContain("new syntax:");
		expect(output(result)).toContain("folio-legacy-");
		expect(readFileSync(join(configDir, "config.yml"), "utf-8")).toContain(
			'id: "bnd_',
		);
		rmSync(repo, { recursive: true, force: true });
	});

	test("unknown commands do not create or migrate configuration", () => {
		const freshHome = mkdtempSync(join(tmpdir(), "folio-cli-home-"));
		homes.push(freshHome);
		const unknown = runCliAtHome(["notacommand"], freshHome);
		expect(unknown.exitCode).not.toBe(0);
		expect(existsSync(join(freshHome, ".config", "folio"))).toBe(false);

		const legacyHome = mkdtempSync(join(tmpdir(), "folio-cli-home-"));
		homes.push(legacyHome);
		const configDir = join(legacyHome, ".config", "folio");
		mkdirSync(configDir, { recursive: true });
		const legacy = "source: /tmp/folio\nstore: git\nstrategy: merge\n";
		const configPath = join(configDir, "config.yml");
		writeFileSync(configPath, legacy, "utf-8");
		expect(runCliAtHome(["notacommand"], legacyHome).exitCode).not.toBe(0);
		expect(readFileSync(configPath, "utf-8")).toBe(legacy);
	});

	test("preserves malformed container-scalar config through a mutating CLI call", () => {
		const home = mkdtempSync(join(tmpdir(), "folio-cli-home-"));
		homes.push(home);
		const configDir = join(home, ".config", "folio");
		mkdirSync(configDir, { recursive: true });
		const malformed =
			"version: 2\nskill: scalar\namendments:\n  path: /tmp/amendments\nbindings:\n";
		const configPath = join(configDir, "config.yml");
		writeFileSync(configPath, malformed, "utf-8");
		const result = runCliAtHome(["bind", "new", "--path", "/tmp/nope"], home);
		expect(result.exitCode).not.toBe(0);
		expect(readFileSync(configPath, "utf-8")).toBe(malformed);
	});

	test("refuses unregistered and branch-mismatched destructive paths", () => {
		const home = mkdtempSync(join(tmpdir(), "folio-cli-home-"));
		homes.push(home);
		const repo = localBlock("safe");
		expect(runCliAtHome(["bind", "safe", "--path", repo], home).exitCode).toBe(
			0,
		);
		const unregistered = join(
			home,
			".config",
			"folio",
			"stores",
			"amendments",
			"unregistered",
		);
		mkdirSync(unregistered, { recursive: true });
		writeFileSync(join(unregistered, "keep.txt"), "keep", "utf-8");
		const refused = runCliAtHome(
			["drop", "safe:unregistered", "--force"],
			home,
		);
		expect(refused.exitCode).not.toBe(0);
		expect(existsSync(join(unregistered, "keep.txt"))).toBe(true);
		const lintRefused = runCliAtHome(["lint", "safe:unregistered"], home);
		expect(lintRefused.exitCode).not.toBe(0);

		expect(runCliAtHome(["draft", "safe:branch-check"], home).exitCode).toBe(0);
		const config = readFileSync(
			join(home, ".config", "folio", "config.yml"),
			"utf-8",
		);
		const id = config.match(/^\s+id: "(bnd_[0-9a-f]+)"$/m)?.[1] as string;
		const worktree = join(
			home,
			".config",
			"folio",
			"stores",
			"amendments",
			id,
			"branch-check",
		);
		const renamed = runFile("git", [
			"-C",
			repo,
			"branch",
			"-m",
			"amend/branch-check",
			"amend/other",
		]);
		expect(renamed.exitCode).toBe(0);
		const mismatch = runCliAtHome(
			["drop", "safe:branch-check", "--force"],
			home,
		);
		expect(mismatch.exitCode).not.toBe(0);
		expect(existsSync(worktree)).toBe(true);
	});

	test("uses a custom amendments root for lifecycle ownership", () => {
		const home = mkdtempSync(join(tmpdir(), "folio-cli-home-"));
		homes.push(home);
		const repo = localBlock("custom");
		const customRoot = join(home, "custom-amendments");
		expect(
			runCliAtHome(["bind", "custom", "--path", repo], home).exitCode,
		).toBe(0);
		const configPath = join(home, ".config", "folio", "config.yml");
		expect(
			runCliAtHome(["config", "amendments", customRoot], home).exitCode,
		).toBe(0);
		expect(runCliAtHome(["config", "strategy", "pr"], home).exitCode).not.toBe(
			0,
		);
		expect(runCliAtHome(["draft", "custom:rooted"], home).exitCode).toBe(0);
		expect(existsSync(join(customRoot, "bnd_"))).toBe(false);
		const id = readFileSync(configPath, "utf-8").match(
			/^\s+id: "(bnd_[0-9a-f]+)"$/m,
		)?.[1] as string;
		const worktree = join(customRoot, id, "rooted");
		expect(existsSync(worktree)).toBe(true);
		expect(runCliAtHome(["unbind", "custom"], home).exitCode).not.toBe(0);
	});

	test("reports cached-ref fetch failures in aggregate status", () => {
		const home = mkdtempSync(join(tmpdir(), "folio-cli-home-"));
		homes.push(home);
		const repo = localBlock("cached");
		expect(
			runFile("git", [
				"-C",
				repo,
				"remote",
				"add",
				"origin",
				"git@github.com:owner/cached.git",
			]).exitCode,
		).toBe(0);
		expect(
			runFile("git", [
				"-C",
				repo,
				"update-ref",
				"refs/remotes/origin/main",
				"HEAD",
			]).exitCode,
		).toBe(0);
		const bin = join(home, "bin");
		mkdirSync(bin, { recursive: true });
		const fakeGh = join(bin, "gh");
		writeFileSync(fakeGh, "#!/bin/sh\nprintf '%s\\n' '[]'\n", "utf-8");
		chmodSync(fakeGh, 0o755);
		expect(
			runCliAtHome(
				["bind", "cached", "--github", "owner/cached", "--path", repo],
				home,
			).exitCode,
		).toBe(0);
		expect(
			runFile("git", [
				"-C",
				repo,
				"remote",
				"set-url",
				"origin",
				"file:///definitely-missing-folio-remote",
			]).exitCode,
		).toBe(0);
		const result = runCliAtHome(["status"], home, {
			PATH: `${bin}:${process.env.PATH ?? ""}`,
		});
		expect(result.exitCode).not.toBe(0);
		expect(error(result)).toContain("[cached] fetch failed:");
	});

	test("formats one global skill routing description for all blocks", () => {
		const description = formatSkillRouting([
			{
				alias: "ops",
				description: "Operating knowledge",
				index: "/tmp/ops/index.md",
				available: true,
			},
			{
				alias: "personal",
				description: "Personal knowledge",
				index: "/tmp/personal/index.md",
				available: false,
				error: "index.md is unavailable",
			},
		]);
		expect(description).toContain("All Folio blocks are active simultaneously");
		expect(description).toContain("ops: Operating knowledge");
		expect(description).toContain("personal: Personal knowledge");
		expect(description).toContain("/tmp/personal/index.md; unavailable");
	});
});

describe("proof message semantics", () => {
	test("preserves shell syntax when passing an argument", () => {
		const message =
			'Document `folio proof` and $(echo unsafe) without "shell" changes\nKeep O\'Reilly intact';
		const result = runFile(process.execPath, [
			"-e",
			"process.stdout.write(process.argv[1] ?? '')",
			message,
		]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe(message);
	});

	test("defaults to the topic amendment message without -m", () => {
		expect(proofMessage("my-topic", [])).toEqual({
			message: "amend: my-topic",
			explicit: false,
		});
	});

	test("marks -m as an intentional message", () => {
		expect(
			proofMessage("my-topic", ["-m", "Improve the amendment summary"]),
		).toEqual({
			message: "Improve the amendment summary",
			explicit: true,
		});
	});

	test.each([
		["create", false, false],
		["create", false, true],
		["preserve", true, false],
		["update", true, true],
	] as const)(
		"chooses $expected for existing PR=$hasExistingPR and explicit message=$hasExplicitMessage",
		(expected, hasExistingPR, hasExplicitMessage) => {
			expect(proofMetadataAction(hasExistingPR, hasExplicitMessage)).toBe(
				expected,
			);
		},
	);
});
