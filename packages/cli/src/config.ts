import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";

export const FOLIO_HOME =
	process.env.FOLIO_HOME || `${homedir()}/.config/folio`;
export const STORE_DIR = `${FOLIO_HOME}/stores`;
export const AMEND_DIR = `${STORE_DIR}/amendments`;
export const CONFIG_FILE = `${FOLIO_HOME}/config.yml`;
export const BASE_REPO = `${STORE_DIR}/.main`;

export type Strategy = "merge" | "pr";
export type ConfigKey =
	| "version"
	| "remote"
	| "store"
	| "web"
	| "source"
	| "path"
	| "strategy"
	| "skill"
	| "skill-enrich";
export type Binding = {
	id: string;
	description: string;
	path: string;
	github: string | null;
	strategy: Strategy;
};
export type FolioConfig = {
	version: 2;
	skill: { path: string | null };
	amendments: { path: string };
	bindings: Record<string, Binding>;
};
export type MigrationReport = {
	alias: string;
	repo: string;
	path: string;
	adoptedAmendments: string[];
	newSyntax: string[];
};

export function formatMigrationReport(report: MigrationReport): string {
	const adopted = report.adoptedAmendments.length
		? report.adoptedAmendments.join(", ")
		: "none";
	return [
		"Migrated legacy Folio config to named bindings:",
		`  alias: ${report.alias}`,
		`  repository: ${report.repo}`,
		`  path: ${report.path}`,
		`  adopted amendments: ${adopted}`,
		"  new syntax:",
		...report.newSyntax.map((syntax) => `    ${syntax}`),
	].join("\n");
}

let invocationBinding: Binding | null = null;

function scalar(value: string): string {
	const trimmed = value.trim();
	if (trimmed === "") return "";
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	)
		return trimmed.slice(1, -1).replace(/\\([\\"'])/g, "$1");
	return trimmed;
}

/** Parse the deliberately small YAML shape written by Folio itself. */
const ALIAS_RE = /^[a-z0-9][a-z0-9-]*$/;
const ID_RE = /^bnd_[0-9a-f]{8}$/;
const GITHUB_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const V2_TOP_LEVEL = new Set(["version", "skill", "amendments", "bindings"]);
const LEGACY_KEYS = new Set([
	"remote",
	"path",
	"source",
	"store",
	"strategy",
	"skill",
	"skill-enrich",
	"web",
]);

function canonicalPath(path: string): string {
	const resolved = resolvePath(path);
	try {
		return realpathSync(resolved);
	} catch {
		return resolved;
	}
}

function validateBindings(bindings: Record<string, Binding>): void {
	const ids = new Set<string>();
	const githubs = new Set<string>();
	const paths = new Set<string>();
	for (const [alias, binding] of Object.entries(bindings)) {
		if (!ALIAS_RE.test(alias))
			throw new Error(`Invalid binding alias '${alias}'.`);
		if (!ID_RE.test(binding.id))
			throw new Error(`Binding '${alias}' has invalid id '${binding.id}'.`);
		if (ids.has(binding.id))
			throw new Error(`Duplicate binding id '${binding.id}'.`);
		ids.add(binding.id);
		const path = canonicalPath(binding.path);
		if (paths.has(path)) throw new Error(`Duplicate binding path '${path}'.`);
		paths.add(path);
		if (binding.github) {
			if (!GITHUB_RE.test(binding.github))
				throw new Error(`Binding '${alias}' has invalid GitHub repo.`);
			const githubKey = binding.github.toLowerCase();
			if (githubs.has(githubKey))
				throw new Error(`Duplicate GitHub repo '${binding.github}'.`);
			githubs.add(githubKey);
		}
		if (binding.strategy === "pr" && !binding.github)
			throw new Error(`Binding '${alias}' using pr strategy needs github.`);
	}
}

function parseV2(raw: string): FolioConfig {
	const sections = new Set<string>();
	const fields = new Map<string, string>();
	const bindingFields = new Map<string, Set<string>>();
	let section = "";
	let alias = "";
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim() || line.trimStart().startsWith("#")) continue;
		const indent = line.length - line.trimStart().length;
		const match = line.match(/^( *)([^:]+):(?:\s*(.*))?$/);
		if (!match || ![0, 2, 4].includes(indent))
			throw new Error(`Invalid Folio config structure: ${line}`);
		const key = match[2].trim();
		const rawValue = match[3];
		const value = scalar(rawValue ?? "");
		if (indent === 0) {
			if (!V2_TOP_LEVEL.has(key) || sections.has(key))
				throw new Error(`Unknown or duplicate Folio config section '${key}'.`);
			if (
				(key === "skill" || key === "amendments" || key === "bindings") &&
				rawValue !== undefined &&
				rawValue.trim() !== ""
			)
				throw new Error(
					`Container section '${key}' cannot have a scalar value.`,
				);
			sections.add(key);
			section = key;
			alias = "";
			if (key === "version" && value !== "2")
				throw new Error(
					"Unsupported Folio config version; expected version: 2.",
				);
			if (key === "version") fields.set("version", value);
			continue;
		}
		if (indent === 2) {
			if (section === "bindings") {
				if (!ALIAS_RE.test(key))
					throw new Error(`Invalid binding alias '${key}'.`);
				if (bindingFields.has(key))
					throw new Error(`Duplicate binding alias '${key}'.`);
				bindingFields.set(key, new Set());
				alias = key;
				continue;
			}
			if (section !== "skill" && section !== "amendments")
				throw new Error(`Unknown Folio config structure near '${key}'.`);
			if (key !== "path" || fields.has(`${section}.path`))
				throw new Error(`Unknown or duplicate '${section}.${key}'.`);
			fields.set(`${section}.path`, value);
			continue;
		}
		if (section !== "bindings" || !alias)
			throw new Error(`Unexpected nested Folio config field '${key}'.`);
		const allowed = new Set([
			"id",
			"description",
			"path",
			"github",
			"strategy",
		]);
		const set = bindingFields.get(alias) as Set<string>;
		if (!allowed.has(key) || set.has(key))
			throw new Error(`Unknown or duplicate binding field '${key}'.`);
		set.add(key);
		fields.set(`bindings.${alias}.${key}`, value);
	}
	if (
		fields.get("version") !== "2" ||
		!sections.has("skill") ||
		!sections.has("amendments") ||
		!sections.has("bindings")
	)
		throw new Error(
			"Invalid Folio config: expected complete version 2 structure.",
		);
	const bindings: Record<string, Binding> = {};
	for (const [name, set] of bindingFields) {
		const required = ["id", "description", "path", "github", "strategy"];
		if (required.some((key) => !set.has(key)))
			throw new Error(`Binding '${name}' is incomplete in ${CONFIG_FILE}.`);
		const prefix = `bindings.${name}.`;
		const strategy = fields.get(`${prefix}strategy`);
		if (strategy !== "merge" && strategy !== "pr")
			throw new Error(`Binding '${name}' has invalid strategy '${strategy}'.`);
		bindings[name] = {
			id: fields.get(`${prefix}id`) as string,
			description: fields.get(`${prefix}description`) as string,
			path: resolvePath(fields.get(`${prefix}path`) as string),
			github: fields.get(`${prefix}github`) || null,
			strategy,
		};
	}
	validateBindings(bindings);
	const amendments = fields.get("amendments.path");
	if (!amendments) throw new Error("Folio amendments.path is required.");
	return {
		version: 2,
		skill: {
			path: fields.get("skill.path")
				? resolvePath(fields.get("skill.path") as string)
				: null,
		},
		amendments: { path: resolvePath(amendments) },
		bindings,
	};
}

export function parseConfigSnapshot(raw: string): FolioConfig {
	const first =
		raw
			.split(/\r?\n/)
			.find((line) => line.trim() && !line.trimStart().startsWith("#")) ?? "";
	return first.startsWith("version:") ? parseV2(raw) : migrateLegacyConfig(raw);
}

function yamlScalar(value: string | null): string {
	return value === null ? "" : JSON.stringify(value);
}

function serialize(config: FolioConfig): string {
	const lines = [
		"version: 2",
		"",
		"skill:",
		`  path: ${yamlScalar(config.skill.path)}`,
		"",
		"amendments:",
		`  path: ${yamlScalar(config.amendments.path)}`,
		"",
		"bindings:",
	];
	for (const alias of Object.keys(config.bindings).sort()) {
		const b = config.bindings[alias];
		lines.push(
			`  ${alias}:`,
			`    id: ${yamlScalar(b.id)}`,
			`    description: ${yamlScalar(b.description)}`,
			`    path: ${yamlScalar(b.path)}`,
			`    github: ${yamlScalar(b.github)}`,
			`    strategy: ${yamlScalar(b.strategy)}`,
		);
	}
	return `${lines.join("\n")}\n`;
}

export function emptyConfig(): FolioConfig {
	return {
		version: 2,
		skill: { path: null },
		amendments: { path: resolve(AMEND_DIR) },
		bindings: {},
	};
}
export function loadConfig(): FolioConfig {
	return existsSync(CONFIG_FILE)
		? parseV2(readFileSync(CONFIG_FILE, "utf-8"))
		: emptyConfig();
}
export function saveConfig(config: FolioConfig): void {
	validateBindings(config.bindings);
	mkdirSync(dirname(CONFIG_FILE), { recursive: true });
	const pending = `${CONFIG_FILE}.${process.pid}.tmp`;
	writeFileSync(pending, serialize(config), "utf-8");
	renameSync(pending, CONFIG_FILE);
}

export function validateConfig(config: FolioConfig): void {
	if (config.version !== 2)
		throw new Error("Unsupported Folio config version; expected version: 2.");
	if (!config.skill || !config.amendments?.path || !config.bindings)
		throw new Error("Invalid Folio config structure.");
	validateBindings(config.bindings);
}

function stableId(alias: string, github: string | null, path: string): string {
	return `bnd_${createHash("sha256")
		.update(`${alias}\0${github ?? ""}\0${path}`)
		.digest("hex")
		.slice(0, 8)}`;
}
function inferDescription(path: string, alias: string): string {
	try {
		const match = readFileSync(`${path}/index.md`, "utf-8").match(
			/^description:\s*(.+)$/m,
		);
		if (match?.[1]) return scalar(match[1]);
	} catch {
		/* checkout may not exist yet */
	}
	return `Folio knowledge block '${alias}'.`;
}
function legacyConfig(raw: string): Map<string, string> {
	const result = new Map<string, string>();
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim() || line.trimStart().startsWith("#")) continue;
		const match = line.match(/^([\w-]+):[^\S\n]*(.*)$/);
		if (!match || match[1] === "version" || !LEGACY_KEYS.has(match[1]))
			throw new Error(
				"Invalid or unrecognized legacy Folio config; left unchanged.",
			);
		if (result.has(match[1]))
			throw new Error(`Duplicate legacy config key '${match[1]}'.`);
		result.set(match[1], scalar(match[2]));
	}
	if (!result.has("remote") && !result.has("path") && !result.has("source"))
		throw new Error("Unrecognized legacy Folio config; left unchanged.");
	const github = result.get("remote") || null;
	if (github && !GITHUB_RE.test(github))
		throw new Error("Invalid legacy GitHub repo; left unchanged.");
	const strategy = result.get("strategy");
	if (strategy && strategy !== "merge" && strategy !== "pr")
		throw new Error("Invalid legacy strategy; left unchanged.");
	return result;
}

/** Convert the one-binding v0.4 config once, preserving its checkout/worktrees. */
export function migrateLegacyConfig(raw: string): FolioConfig {
	const old = legacyConfig(raw);
	const github = old.get("remote") || null;
	const configuredPath = old.get("path") || old.get("source") || "";
	const aliasSeed = github
		? github.split("/").at(-1) || "default"
		: basename(configuredPath || "default");
	const alias = topicToSlug(aliasSeed) || "default";
	const path = resolvePath(configuredPath || BASE_REPO);
	const strategy: Strategy =
		old.get("strategy") === "merge" || !github ? "merge" : "pr";
	const config = {
		version: 2,
		skill: {
			path: old.get("skill") ? resolvePath(old.get("skill") as string) : null,
		},
		amendments: { path: resolve(AMEND_DIR) },
		bindings: {
			[alias]: {
				id: stableId(alias, github, path),
				description: inferDescription(path, alias),
				path,
				github,
				strategy,
			},
		},
	};
	validateBindings(config.bindings);
	return config;
}

function registeredLegacyAmendments(path: string): string[] {
	const result = spawnSync(
		"git",
		["-C", path, "worktree", "list", "--porcelain"],
		{
			encoding: "utf-8",
		},
	);
	if (result.status !== 0) return [];
	const root = canonicalPath(AMEND_DIR);
	return result.stdout
		.split(/\r?\n/)
		.filter((line) => line.startsWith("worktree "))
		.map((line) => line.slice("worktree ".length))
		.filter((worktree) => {
			const candidate = canonicalPath(worktree);
			return candidate.startsWith(`${root}/`);
		})
		.map((worktree) => basename(worktree));
}

export function ensureConfig(): MigrationReport | null {
	mkdirSync(FOLIO_HOME, { recursive: true });
	mkdirSync(STORE_DIR, { recursive: true });
	let report: MigrationReport | null = null;
	if (!existsSync(CONFIG_FILE)) saveConfig(emptyConfig());
	else {
		const raw = readFileSync(CONFIG_FILE, "utf-8");
		const first =
			raw
				.split(/\r?\n/)
				.find((line) => line.trim() && !line.trimStart().startsWith("#")) ?? "";
		if (first.startsWith("version:")) {
			parseV2(raw);
		} else {
			const migratedConfig = migrateLegacyConfig(raw);
			const [alias, binding] = Object.entries(migratedConfig.bindings)[0];
			report = {
				alias,
				repo: binding.github ?? "local",
				path: binding.path,
				adoptedAmendments: registeredLegacyAmendments(binding.path),
				newSyntax: [
					`folio draft ${alias}:<topic>`,
					`folio proof ${alias}:<topic>`,
					`folio publish ${alias}:<topic>`,
				],
			};
			saveConfig(migratedConfig);
		}
	}
	const config = loadConfig();
	mkdirSync(config.amendments.path, { recursive: true });
	for (const binding of Object.values(config.bindings)) {
		mkdirSync(binding.path, { recursive: true });
		mkdirSync(bindingAmendmentsPath(binding), { recursive: true });
	}
	return report;
}

export function readConfig(key?: ConfigKey): string | null {
	if (!existsSync(CONFIG_FILE)) return null;
	if (!key) return readFileSync(CONFIG_FILE, "utf-8");
	if (/^version:\s*2\s*$/m.test(readFileSync(CONFIG_FILE, "utf-8"))) {
		const config = loadConfig();
		if (key === "version") return "2";
		if (key === "skill") return config.skill.path;
		const binding = soleBinding();
		if (binding && key === "remote") return binding.github;
		if (binding && (key === "path" || key === "source")) return binding.path;
		if (binding && key === "strategy") return binding.strategy;
		return null;
	}
	const match = readFileSync(CONFIG_FILE, "utf-8").match(
		new RegExp(`^${key}:[^\\S\\n]*(.*)$`, "m"),
	);
	return match?.[1]?.trim() || null;
}

/** Legacy-compatible scalar writes; structured v2 state uses saveConfig. */
export function writeConfig(key: ConfigKey, value: string): void {
	const config = loadConfig();
	if (key === "skill") config.skill.path = value ? resolvePath(value) : null;
	else if (
		key === "path" ||
		key === "source" ||
		key === "remote" ||
		key === "strategy"
	) {
		const entries = Object.entries(config.bindings);
		if (entries.length !== 1)
			throw new Error(
				"A single binding must exist before setting binding config.",
			);
		const [alias, binding] = entries[0];
		if (key === "path") binding.path = resolvePath(value);
		if (key === "remote") binding.github = value || null;
		if (key === "strategy" && (value === "merge" || value === "pr"))
			binding.strategy = value;
		config.bindings[alias] = binding;
	} else if (key !== "skill-enrich")
		throw new Error(`Unknown config key '${key}'.`);
	saveConfig(config);
}

export function getBindings(): Record<string, Binding> {
	return loadConfig().bindings;
}
export function getBinding(alias: string): Binding {
	const binding = getBindings()[alias];
	if (!binding)
		throw new Error(`Unknown binding '${alias}'. Run 'folio bindings'.`);
	return binding;
}
export function soleBinding(): Binding | null {
	const values = Object.values(getBindings());
	return values.length === 1 ? values[0] : null;
}
export function setBindingContext(binding: Binding): void {
	invocationBinding = binding;
}
export function clearBindingContext(): void {
	invocationBinding = null;
}
export function selectedBinding(): Binding | null {
	return invocationBinding ?? soleBinding();
}
export function requireSoleBinding(): Binding {
	if (invocationBinding) return invocationBinding;
	const entries = Object.entries(getBindings());
	if (entries.length === 0)
		throw new Error("No binding configured — run 'folio bind <binding>'.");
	if (entries.length > 1)
		throw new Error(
			"Multiple bindings configured — specify a binding explicitly.",
		);
	return entries[0][1];
}
export function parseQualifiedTopic(identity: string): {
	alias: string;
	topic: string;
	slug: string;
	binding: Binding;
} {
	const separator = identity.indexOf(":");
	if (
		separator <= 0 ||
		separator === identity.length - 1 ||
		identity.indexOf(":", separator + 1) !== -1
	) {
		throw new Error(
			`Draft identity must be qualified as <binding>:<topic> (received '${identity}').`,
		);
	}
	const alias = identity.slice(0, separator);
	const topic = identity.slice(separator + 1);
	if (!/^[a-z0-9][a-z0-9-]*$/.test(alias))
		throw new Error(`Invalid binding '${alias}'.`);
	const slug = topicToSlug(topic);
	if (!slug) throw new Error(`Invalid topic '${topic}'.`);
	return { alias, topic, slug, binding: getBinding(alias) };
}
export function bindingAlias(binding: Binding): string {
	return (
		Object.entries(getBindings()).find(([, b]) => b.id === binding.id)?.[0] ??
		""
	);
}
export function bindingAmendmentsPath(binding: Binding): string {
	return `${loadConfig().amendments.path}/${binding.id}`;
}
/** v0.4's flat worktree location; retained for read/adoption during migration. */
export function amendmentPath(
	topic: string,
	binding: Binding = requireSoleBinding(),
): string {
	const slug = topicToSlug(topic);
	return `${bindingAmendmentsPath(binding)}/${slug}`;
}
export function getRemote(): string {
	const github = requireSoleBinding().github;
	if (!github) throw new Error("no GitHub remote configured for this binding");
	return github;
}
export function getPath(): string | null {
	return requireSoleBinding().path;
}
export function baseRepo(): string {
	return requireSoleBinding().path;
}
export function hasRemote(): boolean {
	return Boolean(requireSoleBinding().github);
}
export function getStrategy(): Strategy {
	return requireSoleBinding().strategy;
}
export function resolvePath(p: string): string {
	const expanded =
		p === "~" || p.startsWith("~/") ? `${homedir()}${p.slice(1)}` : p;
	return resolve(expanded);
}
export function topicToSlug(topic: string): string {
	return topic
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-/, "")
		.replace(/-$/, "");
}
export function bindingCheckoutPath(alias: string): string {
	return `${STORE_DIR}/bindings/${topicToSlug(alias)}`;
}
