#!/usr/bin/env node
/**
 * folio — knowledge management CLI (amendments model)
 *
 * User-scoped. Global config in ~/.config/folio/config.yml.
 * Amendments are git worktrees; multiple drafts run concurrently. Every
 * draft verb takes its topic explicitly (arg, or $FOLIO_DRAFT) — no shared
 * "active" pointer, so concurrent agents never collide.
 */
import pkg from "../package.json";
import {
	cmdBind,
	cmdConfig,
	cmdCreate,
	cmdDraft,
	cmdDrop,
	cmdLint,
	cmdList,
	cmdProof,
	cmdPublish,
	cmdSkill,
	cmdStatus,
	cmdUpdate,
	cmdWeb,
} from "./commands";

function die(msg: string): never {
	console.error(`folio: ${msg}`);
	process.exit(1);
}

const ROOT_HELP = `
folio — knowledge management CLI

Usage:
  folio --version | -v             Print the CLI version
  folio bind <ns/repo> [--web]    Bind to a knowledge repo (one-time setup)
  folio bind <ns/repo> <path>      Bind to a knowledge repo, cloned into <path>
  folio bind <path>                Bind to a local git repo, in place
  folio create <path>              Scaffold a new folio and bind to it
  folio draft <topic>              Start or resume a draft (--force to restart)
  folio proof <topic>              Commit dirty work, lint, rebase; push + open draft PR (pr) or show diff (local)
  folio publish <topic>            Merge the draft into main
  folio status [--sync]            Fleet dashboard; --sync fast-forwards the bound store
  folio update [--version X.Y.Z] [--yes]  Check or install a stable CLI release
  folio drop <topic> --force       Delete a draft (local + remote)
  folio list                       List all drafts
  folio config                     Show global config
  folio config <key> <value>       Set config value
  folio web                        Open Folio Web or GitHub PR list for bound repo
  folio web --no-open              Print URL only
  folio lint [<topic>]             Check folio integrity (a draft, or main if omitted)
  folio lint --spec folio          Check with an explicit lint spec
  folio lint --json                Machine-readable output
  folio lint --strict              Exit 1 if any errors
  folio skill install [path]       Download the matching Folio skill into [path] (remembers it; --no-enrich omits bound block context)

Edits go in the draft worktree at ~/.config/folio/stores/amendments/<topic>/.
Flow: draft <topic> → edit → proof <topic> → publish <topic>.

Every draft verb resolves its topic as: explicit argument, then
$FOLIO_DRAFT, then an error. Set FOLIO_DRAFT once in a script or hook that
wraps the whole ritual in a single process; interactive agents should keep
passing the topic explicitly. Chain steps with && (e.g. folio draft my-topic
&& ... && folio proof my-topic) — verbs stay single-purpose.
`;

const COMMAND_HELP: Record<string, string> = {
	bind: `Usage: folio bind <owner/repo> [path] [--remote|--local] [--web] [--force]\n\nBind a remote Folio repository or an existing local repository.`,
	create: `Usage: folio create <path> [--force]\n\nCreate a new local Folio repository and bind to it.`,
	draft: `Usage: folio draft <topic> [--force]\n\nStart or resume a draft. --force restarts a draft already published.`,
	proof: `Usage: folio proof <topic> [-m <message>]\n\nCommit dirty work, lint, rebase, and update the draft PR or local diff.`,
	publish: `Usage: folio publish <topic>\n\nMerge a ready draft PR, or publish a local-strategy draft.`,
	drop: `Usage: folio drop <topic> [--force]\n\nDiscard a draft. --force confirms deletion when local edits or a PR exist.`,
	list: `Usage: folio list\n\nList drafts in the bound Folio.`,
	status: `Usage: folio status [--sync]\n\nShow the bound Folio and every draft. --sync fast-forwards the bound store.`,
	update: `Usage: folio update [--version <X.Y.Z>] [--yes]\n\nCheck for or install a stable CLI release. --yes permits a non-interactive update.`,
	config: `Usage: folio config [<key> [<value>]]\n\nShow all configuration, read one key, or set one key.`,
	web: `Usage: folio web [--no-open|--print-url]\n\nOpen the Folio Web or GitHub PR page for the bound repository.`,
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
	switch (cmd) {
		case "bind":
			cmdBind(args);
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
		case "list":
			cmdList();
			break;
		case "status":
			cmdStatus(args);
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
