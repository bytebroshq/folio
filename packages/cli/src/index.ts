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
	cmdWeb,
} from "./commands";

function die(msg: string): never {
	console.error(`folio: ${msg}`);
	process.exit(1);
}

function help(): never {
	console.log(`
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
  folio status [-u]                Fleet dashboard: every draft's state; -u fast-forwards main
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
  folio skill install [path]       Write the embedded folio skill into [path] (remembers it; re-run bare to refresh)

Edits go in ~/.config/folio/stores/amendments/<topic>/.
Flow: draft <topic> → edit → proof <topic> → publish <topic>.

Every draft verb resolves its topic as: explicit argument, then
$FOLIO_DRAFT, then an error. Set FOLIO_DRAFT once in a script or hook that
wraps the whole ritual in a single process; interactive agents should keep
passing the topic explicitly. Chain steps with && (e.g. folio draft my-topic
&& ... && folio proof my-topic) — verbs stay single-purpose.
`);
	process.exit(0);
}

const cmd = process.argv[2];
const args = process.argv.slice(3);

if (cmd === "--version" || cmd === "-v") {
	console.log(`folio ${pkg.version}`);
	process.exit(0);
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
			cmdSkill(args);
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
