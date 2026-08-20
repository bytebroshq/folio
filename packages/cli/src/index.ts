#!/usr/bin/env node
/**
 * folio — knowledge management CLI (amendments model)
 *
 * User-scoped. Global config in ~/.config/folio/config.yml.
 * Amendments are git worktrees; multiple drafts run concurrently. Every
 * draft verbs take a qualified alias:topic identity (or $FOLIO_DRAFT) — no
 * shared "active" pointer, so concurrent agents never collide.
 */
import pkg from "../package.json";
import {
	cmdBind,
	cmdBindingRename,
	cmdBindings,
	cmdConfig,
	cmdCreate,
	cmdDraft,
	cmdDrafts,
	cmdDrop,
	cmdLint,
	cmdMap,
	cmdProof,
	cmdPublish,
	cmdSkill,
	cmdStatus,
	cmdUnbind,
	cmdUpdate,
	cmdWeb,
} from "./commands";
import { ensureConfig, formatMigrationReport } from "./config";

function die(msg: string): never {
	console.error(`folio: ${msg}`);
	process.exit(1);
}

const ROOT_HELP = `
folio — knowledge management CLI

Usage:
  folio --version | -v             Print the CLI version
  folio bind <alias> --github <owner/repo> [--path <path>]  Add a GitHub block binding
  folio bind <alias> --path <path>                          Add a local block binding
  folio create <alias> --path <path>                       Scaffold and bind a block
  folio bindings                       List configured block bindings
  folio binding rename <old> <new>      Rename a binding alias
  folio unbind <alias>                  Remove a binding, preserving files
  folio map [<alias>] [--json]     Show the LLM-oriented block routing map
  folio draft <alias>:<topic>      Start or resume a draft (--force to restart)
  folio proof <alias>:<topic>      Commit dirty work, lint, rebase, and proof a draft
  folio publish <alias>:<topic>    Merge the qualified draft into main
  folio status [<alias>] [--sync] Fleet dashboard; --sync requires one alias
  folio update [--version X.Y.Z] [--yes]  Check or install a stable CLI release
  folio drop <alias>:<topic> --force Delete a draft (local + remote)
  folio drafts [<alias>]           List drafts for all blocks or one block
  folio config                     Show global config
  folio config <key> <value>       Set config value
  folio web                        Disabled; use folio map for block routing
  folio lint [<topic>]             Check folio integrity (a draft, or main if omitted)
  folio lint --spec folio          Check with an explicit lint spec
  folio lint --json                Machine-readable output
  folio lint --strict              Exit 1 if any errors
  folio skill install [path]       Download the matching Folio skill into [path] (remembers it; --no-enrich omits global routing)

Edits go in the binding-specific amendment worktree under the configured amendments root.
Flow: draft <alias>:<topic> → edit → proof <alias>:<topic> → publish <alias>:<topic>.

Every draft verb requires a qualified alias:topic identity, supplied explicitly
or through $FOLIO_DRAFT. Set FOLIO_DRAFT once in a script or hook that
wraps the whole ritual in a single process; interactive agents should keep
  passing the qualified identity explicitly. Chain steps with && (e.g. folio
draft personal:my-topic && ... && folio proof personal:my-topic) — verbs stay
single-purpose.
`;

const COMMAND_HELP: Record<string, string> = {
	bind: `Usage: folio bind <alias> --github <owner/repo> [--path <path>] [--description <text>] [--strategy merge|pr]\n\nAdd a named Folio block binding.`,
	bindings: `Usage: folio bindings\n\nList configured block bindings.`,
	binding: `Usage: folio binding rename <old> <new>\n\nRename a binding without moving its checkout or amendments.`,
	map: `Usage: folio map [<alias>] [--json]\n\nShow the LLM-oriented routing map for all blocks or one block.`,
	create: `Usage: folio create <alias> --path <path> [--description <text>]\n\nCreate a new local Folio repository and bind to it.`,
	draft: `Usage: folio draft <alias>:<topic> [--force]\n\nStart or resume a qualified draft.`,
	proof: `Usage: folio proof <alias>:<topic> [-m <message>]\n\nCommit dirty work, lint, rebase, and proof a qualified draft.`,
	publish: `Usage: folio publish <alias>:<topic>\n\nMerge a ready qualified draft.`,
	drop: `Usage: folio drop <alias>:<topic> [--force]\n\nDiscard a qualified draft.`,
	drafts: `Usage: folio drafts [<alias>]\n\nList drafts for all blocks or one block.`,
	status: `Usage: folio status [<alias>] [--sync]\n\nShow all bindings or one binding. --sync requires exactly one alias.`,
	update: `Usage: folio update [--version <X.Y.Z>] [--yes]\n\nCheck for or install a stable CLI release. --yes permits a non-interactive update.`,
	config: `Usage: folio config [<key> [<value>]]\n\nShow all configuration, read one key, or set one key.`,
	unbind: `Usage: folio unbind <alias>\n\nRemove a binding while preserving its checkout and amendments.`,
	web: `Usage: folio web\n\nDisabled; use folio map for block routing.`,
	lint: `Usage: folio lint [<topic>] [--spec <name>] [--json] [--strict]\n\nCheck Folio integrity for a draft or the bound main store.`,
	skill: `Usage: folio skill install [path] [--enrich|--no-enrich]\n\nManage the installed Folio agent skill.`,
	"skill install": `Usage: folio skill install [path] [--enrich|--no-enrich]\n\nDownload the matching Folio skill and synchronize it to the given or remembered path.`,
};

const HELP_VALUE_FLAGS: Record<string, readonly string[]> = {
	proof: ["-m"],
	lint: ["--spec"],
	update: ["--version"],
};

function hasHelpFlag(command: string, args: string[]): boolean {
	const valueFlags = HELP_VALUE_FLAGS[command] ?? [];
	for (let i = 0; i < args.length; i++) {
		if (valueFlags.includes(args[i] as string)) {
			i++;
			continue;
		}
		if (args[i] === "--help" || args[i] === "-h") return true;
	}
	return false;
}

function help(command?: string, args: string[] = []): never {
	if (command === "skill" && args[0] === "install") {
		if (hasHelpFlag("skill install", args.slice(1))) {
			console.log(COMMAND_HELP["skill install"]);
			process.exit(0);
		}
	} else if (command && COMMAND_HELP[command] && hasHelpFlag(command, args)) {
		console.log(COMMAND_HELP[command]);
		process.exit(0);
	}

	console.log(ROOT_HELP);
	process.exit(0);
}

const cmd = process.argv[2];
const args = process.argv.slice(3);

if (cmd === "--version" || cmd === "-v") {
	console.log(`folio ${pkg.version}`);
	process.exit(0);
}

// Resolve help before command handlers so it has no side effects. The parser
// skips values consumed by command options (for example, proof -m "--help").
if (
	cmd === "skill" &&
	args[0] === "install" &&
	hasHelpFlag("skill install", args.slice(1))
) {
	help(cmd, args);
}
if (cmd && COMMAND_HELP[cmd] && hasHelpFlag(cmd, args)) {
	help(cmd, args);
}

try {
	const migration = ensureConfig();
	if (migration) console.log(formatMigrationReport(migration));
	switch (cmd) {
		case "bind":
			cmdBind(args);
			break;
		case "bindings":
			cmdBindings();
			break;
		case "binding":
			if (args[0] === "rename") cmdBindingRename(args.slice(1));
			else throw new Error("Usage: folio binding rename <old> <new>");
			break;
		case "create":
			cmdCreate(args);
			break;
		case "draft":
			cmdDraft(args);
			break;
		case "proof":
			cmdProof(args);
			break;
		case "publish":
			cmdPublish(args);
			break;
		case "drop":
			cmdDrop(args);
			break;
		case "drafts":
			cmdDrafts(args);
			break;
		case "map":
			cmdMap(args);
			break;
		case "status":
			cmdStatus(args);
			break;
		case "unbind":
			cmdUnbind(args);
			break;
		case "update":
			await cmdUpdate(args, pkg.version);
			break;
		case "config":
			cmdConfig(args);
			break;
		case "web":
			cmdWeb(args);
			break;
		case "lint":
			cmdLint(args);
			break;
		case "skill":
			await cmdSkill(args, pkg.version);
			break;
		case undefined:
		case "-h":
		case "--help":
			help();
			break;
		default:
			die(`unknown command '${cmd}'. Run 'folio --help' for usage.`);
	}
} catch (err: unknown) {
	const msg = err instanceof Error ? err.message : String(err);
	die(msg);
}
