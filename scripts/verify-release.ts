import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url);
const rootPath = (path: string) => new URL(path, ROOT);
const cliPackage = JSON.parse(
	readFileSync(rootPath("packages/cli/package.json"), "utf-8"),
) as { version: string };
const expected = `folio ${cliPackage.version}`;
const tagIndex = process.argv.indexOf("--tag");
const tag = tagIndex === -1 ? undefined : process.argv[tagIndex + 1];

function output(command: string, args: string[]): string {
	return execFileSync(command, args, {
		cwd: rootPath(".").pathname,
		encoding: "utf-8",
	}).trim();
}

function run(command: string, args: string[]): void {
	execFileSync(command, args, { cwd: rootPath(".").pathname, stdio: "inherit" });
}

if (!tag) throw new Error("Usage: bun run verify-release -- --tag vX.Y.Z");
if (tag !== `v${cliPackage.version}`)
	throw new Error(`Tag ${tag} does not match CLI version ${cliPackage.version}.`);

run("bun", ["run", "--filter", "@folio/cli", "build"]);
run("bun", ["run", "--filter", "@folio/cli", "package-skill"]);

const cliVersion = output("node", ["packages/cli/dist/folio.js", "--version"]);
const skillVersion = output("node", ["packages/skills/folio/version.js"]);
if (cliVersion !== expected || skillVersion !== expected)
	throw new Error(
		`Version mismatch: tag=${tag}, cli=${cliVersion}, skill=${skillVersion}.`,
	);

const temp = mkdtempSync(join(tmpdir(), "folio-release-"));
try {
	run("tar", ["-xzf", "packages/cli/dist/folio-skill.tar.gz", "-C", temp]);
	const packagedSkillVersion = output(join(temp, "version.js"), []);
	if (packagedSkillVersion !== expected)
		throw new Error(
			`Skill archive version ${packagedSkillVersion} does not match ${expected}.`,
		);
} finally {
	rmSync(temp, { recursive: true, force: true });
}

console.log(`Release ${tag} verified.`);
