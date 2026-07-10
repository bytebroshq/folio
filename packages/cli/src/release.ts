import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const REPO = "bytebroshq/folio";
const ASSET = "folio.js";
const CHECKSUMS = "SHA256SUMS";

type Release = {
	tag_name: string;
	prerelease: boolean;
	draft: boolean;
	assets: Array<{ name: string; browser_download_url: string }>;
};

function normaliseVersion(version: string): string {
	return version.startsWith("v") ? version : `v${version}`;
}

async function json(url: string): Promise<Release> {
	const response = await fetch(url, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "folio-cli",
		},
	});
	if (!response.ok)
		throw new Error(`Could not check Folio releases (${response.status}).`);
	return (await response.json()) as Release;
}

export async function getRelease(version?: string): Promise<Release> {
	const url = version
		? `https://api.github.com/repos/${REPO}/releases/tags/${normaliseVersion(version)}`
		: `https://api.github.com/repos/${REPO}/releases/latest`;
	const release = await json(url);
	if (release.draft || release.prerelease)
		throw new Error("That release is not a stable Folio release.");
	return release;
}

function compareVersions(a: string, b: string): number {
	const parts = (value: string) =>
		value
			.replace(/^v/, "")
			.split(".")
			.map((part) => Number.parseInt(part, 10));
	const left = parts(a);
	const right = parts(b);
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const diff = (left[i] ?? 0) - (right[i] ?? 0);
		if (diff) return diff;
	}
	return 0;
}

async function download(url: string): Promise<Buffer> {
	const response = await fetch(url, { headers: { "User-Agent": "folio-cli" } });
	if (!response.ok) throw new Error(`Download failed (${response.status}).`);
	return Buffer.from(await response.arrayBuffer());
}

function sha256(data: Buffer): string {
	return createHash("sha256").update(data).digest("hex");
}

function expectedChecksum(contents: string): string {
	const line = contents
		.split("\n")
		.find((entry) => entry.trim().endsWith(` ${ASSET}`));
	const checksum = line?.trim().split(/\s+/)[0];
	if (!checksum || !/^[a-f0-9]{64}$/i.test(checksum))
		throw new Error("Release checksum manifest does not contain folio.js.");
	return checksum.toLowerCase();
}

export type UpdateResult = {
	current: string;
	available: string;
	updated: boolean;
};

/** Check a stable GitHub Release and optionally atomically replace this installed executable. */
export async function updateCli(
	current: string,
	args: string[],
): Promise<UpdateResult> {
	const versionIndex = args.indexOf("--version");
	if (versionIndex >= 0 && !args[versionIndex + 1])
		throw new Error("Usage: folio update [--version X.Y.Z] [--yes]");
	const requested = versionIndex >= 0 ? args[versionIndex + 1] : undefined;
	const release = await getRelease(requested);
	const available = release.tag_name.replace(/^v/, "");
	if (compareVersions(available, current) <= 0 && !requested)
		return { current, available, updated: false };
	if (available === current) return { current, available, updated: false };

	const yes = args.includes("--yes");
	if (!yes && !process.stdin.isTTY)
		return { current, available, updated: false };
	if (!yes) {
		process.stdout.write(`Folio ${current} → ${available}. Apply? [Y/n] `);
		const answer = readFileSync(0, "utf-8").trim().toLowerCase();
		if (answer === "n" || answer === "no")
			return { current, available, updated: false };
	}

	const executable = resolve(process.argv[1] || "");
	if (!process.argv[1])
		throw new Error("Cannot determine the installed Folio executable.");
	const asset = release.assets.find((item) => item.name === ASSET);
	const sums = release.assets.find((item) => item.name === CHECKSUMS);
	if (!asset || !sums)
		throw new Error("Release is missing folio.js or SHA256SUMS.");
	const [binary, checksumFile] = await Promise.all([
		download(asset.browser_download_url),
		download(sums.browser_download_url),
	]);
	if (sha256(binary) !== expectedChecksum(checksumFile.toString("utf-8")))
		throw new Error("Downloaded folio.js failed checksum verification.");

	const tempDir = mkdtempSync(join(tmpdir(), "folio-update-"));
	const candidate = join(tempDir, basename(executable));
	try {
		writeFileSync(candidate, binary, { mode: 0o755 });
		chmodSync(candidate, 0o755);
		const check = spawnSync(process.execPath, [candidate, "--version"], {
			encoding: "utf-8",
		});
		if (check.status !== 0 || check.stdout.trim() !== `folio ${available}`)
			throw new Error("Downloaded release failed its version check.");
		renameSync(candidate, executable);
	} catch (err) {
		throw new Error(
			`Could not replace ${executable}: ${err instanceof Error ? err.message : String(err)}`,
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
	return { current, available, updated: true };
}
