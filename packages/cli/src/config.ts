import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

export const FOLIO_HOME = `${homedir()}/.config/folio`;
export const STORE_DIR = `${FOLIO_HOME}/stores`;
export const AMEND_DIR = `${STORE_DIR}/amendments`;
export const CONFIG_FILE = `${FOLIO_HOME}/config.yml`;
export const BASE_REPO = `${STORE_DIR}/.main`;

export type ConfigKey = "remote" | "store" | "active" | "web";

export function readConfig(key?: ConfigKey): string | null {
	if (!existsSync(CONFIG_FILE)) return null;

	const raw = readFileSync(CONFIG_FILE, "utf-8");
	if (key) {
		const match = raw.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
		return match ? match[1].trim() : null;
	}
	return raw;
}

export function writeConfig(key: ConfigKey, value: string): void {
	const file = existsSync(CONFIG_FILE)
		? readFileSync(CONFIG_FILE, "utf-8")
		: `remote: jubalm/folio\nstore: git\nactive: \n`;

	const regex = new RegExp(`^${key}:.*$`, "m");
	const line = `${key}: ${value}`;

	const updated = regex.test(file)
		? file.replace(regex, line)
		: `${file.trimEnd()}\n${line}\n`;

	writeFileSync(CONFIG_FILE, updated, "utf-8");
}

export function ensureConfig(): void {
	mkdirSync(FOLIO_HOME, { recursive: true });
	mkdirSync(STORE_DIR, { recursive: true });
	mkdirSync(AMEND_DIR, { recursive: true });

	if (!existsSync(CONFIG_FILE)) {
		writeConfig("remote", "jubalm/folio");
		writeConfig("store", "git");
		writeConfig("active", "");
	}
}

export function getActive(): string | null {
	const val = readConfig("active");
	return val && val !== "" ? val : null;
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
