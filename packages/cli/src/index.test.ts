import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proofMessage, proofMetadataAction } from "./commands";
import { runFile } from "./git";

const homes: string[] = [];

function runCli(args: string[]) {
	const home = mkdtempSync(join(tmpdir(), "folio-cli-help-"));
	homes.push(home);
	return Bun.spawnSync(
		[process.execPath, join(import.meta.dir, "index.ts"), ...args],
		{
			cwd: import.meta.dir,
			env: { ...process.env, HOME: home },
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
	test.each([
		["bind"],
		["create"],
		["draft"],
		["proof"],
		["publish"],
		["drop"],
		["list"],
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
		expect(error(result)).toContain("Worktree for 'topic' not found");
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
