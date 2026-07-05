import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const FOLIO_HOME =
	process.env.FOLIO_HOME || `${homedir()}/.config/folio`;
export const STORE_DIR = `${FOLIO_HOME}/stores`;
export const AMEND_DIR = `${STORE_DIR}/amendments`;
export const CONFIG_FILE = `${FOLIO_HOME}/config.yml`;
export const BASE_REPO = `${STORE_DIR}/.main`;

export type ConfigKey =
	| "remote"
	| "store"
	| "active"
	| "web"
	| "source"
	| "path"
	| "strategy"
	| "skill";

/**
 * Read a config value, or the whole file when no key is given.
 *
 * Returns null for a missing key OR an empty value, so callers can rely on
 * truthiness. Whitespace matching stays on a single line ([^\S\n], not \s,
 * which would otherwise cross line boundaries and capture the next entry).
 */
export function readConfig(key?: ConfigKey): string | null {
	if (!existsSync(CONFIG_FILE)) return null;

	const raw = readFileSync(CONFIG_FILE, "utf-8");
	if (!key) return raw;

	const match = raw.match(new RegExp(`^${key}:[^\\S\\n]*(.*)$`, "m"));
	const val = match ? match[1].trim() : null;
	return val && val !== "" ? val : null;
}

/**
 * Write a config value, creating a clean (remote-less) file on first write.
 * A fresh install has no remote until `folio bind` sets one.
 */
export function writeConfig(key: ConfigKey, value: string): void {
	const file = existsSync(CONFIG_FILE)
		? readFileSync(CONFIG_FILE, "utf-8")
		: "remote: \nstore: git\nactive: \n";

	const regex = new RegExp(`^${key}:.*$`, "m");
	const line = `${key}: ${value}`;

	const updated = regex.test(file)
		? file.replace(regex, line)
		: `${file.trimEnd()}\n${line}\n`;

	writeFileSync(CONFIG_FILE, updated, "utf-8");
}

/**
 * Ensure the folio home directory structure and a clean config exist.
 * Does NOT seed a remote — bind chooses it.
 */
export function ensureConfig(): void {
	mkdirSync(FOLIO_HOME, { recursive: true });
	mkdirSync(STORE_DIR, { recursive: true });
	mkdirSync(AMEND_DIR, { recursive: true });

	if (!existsSync(CONFIG_FILE)) {
		writeConfig("remote", "");
		writeConfig("store", "git");
		writeConfig("active", "");
	}

	// Migration shim: legacy configs stored the bind target under `source`.
	// Promote it to `path` (the new location key) once, in place.
	const legacySource = readConfig("source");
	if (legacySource && !readConfig("path")) {
		writeConfig("path", legacySource);
		writeConfig("source", "");
	}
}

export function getActive(): string | null {
	return readConfig("active");
}

export function setActive(topic: string): void {
	writeConfig("active", topic);
}

export function clearActive(): void {
	writeConfig("active", "");
}

export function topicToSlug(topic: string): string {
	return topic
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-/, "")
		.replace(/-$/, "");
}

export function amendmentPath(topic: string): string {
	return `${AMEND_DIR}/${topicToSlug(topic)}`;
}

export function getRemote(): string {
	const remote = readConfig("remote");
	if (!remote)
		throw new Error("no remote configured — run 'folio bind <ns/repo>'");
	return remote;
}

// ── Location / strategy (in-place binding) ──────────────────────────

/**
 * Where the checkout lives: the explicit `path` key, falling back to the
 * legacy `source` key for configs that haven't been migrated yet (belt and
 * suspenders — `ensureConfig()` normally migrates this on read).
 */
export function getPath(): string | null {
	return readConfig("path") ?? readConfig("source");
}

/**
 * The repo that main lives in: the bound local repo when `path` is set,
 * otherwise the managed clone.
 */
export function baseRepo(): string {
	return getPath() ?? BASE_REPO;
}

/** True when a GitHub remote (owner/repo) is configured. */
export function hasRemote(): boolean {
	return !!readConfig("remote");
}

/**
 * What `publish` does: explicit `strategy` key if set, otherwise derived
 * for legacy configs — a remote implies the PR flow, its absence the merge
 * flow.
 */
export function getStrategy(): "merge" | "pr" {
	const explicit = readConfig("strategy");
	if (explicit === "merge" || explicit === "pr") return explicit;
	return hasRemote() ? "pr" : "merge";
}

/** Expand a leading ~ and resolve to an absolute path. */
export function resolvePath(p: string): string {
	const expanded =
		p === "~" || p.startsWith("~/") ? `${homedir()}${p.slice(1)}` : p;
	return resolve(expanded);
}
