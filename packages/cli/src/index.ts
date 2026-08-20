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
  folio bind <binding> --github <owner/repo> [--path <path>] [--description <text>]
                                                    Add a GitHub block binding
  folio bind <binding> --path <path> [--description <text>]
                                                    Add a local block binding
  folio create <binding> --path <path> [--description <text>]
                                                    Scaffold and bind a block
  folio bindings                       List configured block bindings
  folio binding rename <binding> <new-binding> Rename a binding without moving state
  folio unbind <binding>                  Remove a binding, preserving files
  folio map [<binding>] [--json]     Show the LLM-oriented block routing map
  folio draft <binding>:<topic>      Start or resume a draft (--force to restart)
  folio proof <binding>:<topic>      Commit dirty work, lint, rebase, and proof a draft
  folio publish <binding>:<topic>    Merge the qualified draft into main
  folio status [<binding>] [--sync] Fleet dashboard; --sync requires one binding
  folio update [--version X.Y.Z] [--yes]  Check or install a stable CLI release
  folio drop <binding>:<topic> --force Delete a draft (local + remote)
  folio drafts [<binding>]           List drafts for all blocks or one block
  folio config                     Show global config
  folio config skill <path>        Set the global installed-skill path
  folio config amendments <path>   Set the global amendments root
  folio web                        Disabled; use folio map for block routing
  folio lint <binding>             Check one binding main
  folio lint <binding>:<topic>     Check one qualified draft
  folio lint --all                 Check every binding main
                                    Add --spec, --json, or --strict as needed
  folio skill install [path]       Download the matching Folio skill into [path] (remembers it; --no-enrich omits global routing)

Edits go in the binding-specific amendment worktree under the configured amendments root.
A binding is a short, unique name for a configured Folio block (for example, bytebros).
Flow: draft <binding>:<topic> → edit → proof <binding>:<topic> → publish <binding>:<topic>.

Every draft verb requires a qualified binding:topic identity, supplied explicitly
or through $FOLIO_DRAFT. Set FOLIO_DRAFT once in a script or hook that
wraps the whole ritual in a single process; interactive agents should keep
  passing the qualified identity explicitly. Chain steps with && (e.g. folio
draft personal:my-topic && ... && folio proof personal:my-topic) — verbs stay
single-purpose.
`;

const COMMAND_HELP: Record<string, string> = {
	bind: `Usage: folio bind <binding> --github <owner/repo> [--path <path>] [--description <text>] [--strategy merge|pr]\n\nAdd a named Folio block binding. A binding is a short, unique name such as bytebros.`,
	bindings: `Usage: folio bindings\n\nList configured block bindings.`,
	binding: `Usage: folio binding rename <binding> <new-binding>\n\nRename a binding without moving its checkout or amendments.`,
	map: `Usage: folio map [<binding>] [--json]\n\nShow the LLM-oriented routing map for all blocks or one block.`,
	create: `Usage: folio create <binding> --path <path> [--description <text>]\n\nCreate a new local Folio repository and bind to it.`,
	draft: `Usage: folio draft <binding>:<topic> [--force]\n\nStart or resume a qualified draft.`,
	proof: `Usage: folio proof <binding>:<topic> [-m <message>]\n\nCommit dirty work, lint, rebase, and proof a qualified draft.`,
	publish: `Usage: folio publish <binding>:<topic>\n\nMerge a ready qualified draft.`,
	drop: `Usage: folio drop <binding>:<topic> [--force]\n\nDiscard a qualified draft.`,
	drafts: `Usage: folio drafts [<binding>]\n\nList drafts for all blocks or one block.`,
	status: `Usage: folio status [<binding>] [--sync]\n\nShow all bindings or one binding. --sync requires exactly one binding.`,
	update: `Usage: folio update [--version <X.Y.Z>] [--yes]\n\nCheck for or install a stable CLI release. --yes permits a non-interactive update.`,
	config: `Usage: folio config [skill|amendments [<value>]]\n\nShow the registry, read a global setting, or set the global skill path or amendments root. Binding fields are managed by bind/binding commands or explicit YAML edits.`,
	unbind: `Usage: folio unbind <binding>\n\nRemove a binding while preserving its checkout and amendments.`,
	web: `Usage: folio web\n\nDisabled; use folio map for block routing.`,
	lint: `Usage: folio lint <binding>|<binding>:<topic>|--all [--spec <name>] [--json] [--strict]\n\nCheck one binding main, one qualified draft, or explicitly check every binding with --all. Targeted --json returns a direct lint result; --all --json returns binding-qualified results.`,
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
	if (cmd && cmd !== "-h" && cmd !== "--help" && !COMMAND_HELP[cmd])
		die(`unknown command '${cmd}'. Run 'folio --help' for usage.`);
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
