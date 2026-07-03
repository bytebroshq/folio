#!/usr/bin/env node
/**
 * folio — knowledge management CLI (amendments model)
 *
 * User-scoped. Global config in ~/.config/folio/config.yml.
 * One active amendment at a time. Amendments are git worktrees.
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
	cmdSave,
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
  folio bind <path>                Bind to a local git repo, in place
  folio create <path>              Scaffold a new folio and bind to it
  folio draft <topic>              Start or resume a draft (--force to restart)
  folio save [-m "msg"]             Save changes in the active draft
  folio proof                      Lint + rebase; push + open draft PR (pr) or show diff (local)
  folio publish                    Merge the draft into main (pr: only once PR is ready)
  folio status [-u] [-x]           Show current state; -u updates, -x includes PR context
  folio drop <topic> --force       Delete a draft (local + remote)
  folio list                       List all drafts
  folio config                     Show global config
  folio config <key> <value>       Set config value
  folio web                        Open Folio Web or GitHub PR list for bound repo
  folio web --no-open              Print URL only
  folio lint                       Check folio integrity
  folio lint --spec folio          Check with an explicit lint spec
  folio lint --json                Machine-readable output
  folio lint --strict              Exit 1 if any errors
  folio skill install <path>       Write the embedded folio skill into <path>

Edits go in ~/.config/folio/stores/amendments/<topic>/.
Flow: draft → edit → save → proof → publish.
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
		case "save":
			cmdSave(args);
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
