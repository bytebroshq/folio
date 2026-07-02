#!/usr/bin/env node
/**
 * folio — knowledge management CLI (amendments model)
 *
 * User-scoped. Global config in ~/.config/folio/config.yml.
 * One active amendment at a time. Amendments are git worktrees.
 */
import {
	cmdBind,
	cmdConfig,
	cmdDrop,
	cmdLint,
	cmdList,
	cmdStatus,
	cmdSwitch,
	cmdSync,
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
  folio bind <ns/repo> [--web]    Bind to a knowledge repo (one-time setup)
  folio switch                     List amendments (* = active)
  folio switch <topic>            Switch to an existing amendment
  folio switch -c <topic>          Create a new amendment (--force to re-create)
  folio status                     Show current state (main | amendment)
  folio sync [-m "msg"]            Pull main → rebase → commit → push → draft PR
  folio drop <topic> --force       Delete an amendment (local + remote)
  folio list                       List all amendments
  folio config                     Show global config
  folio config <key> <value>       Set config value
  folio web                        Open Folio Web or GitHub PR list for bound repo
  folio web --no-open              Print URL only
  folio lint                       Check folio integrity
  folio lint --spec folio          Check with an explicit lint spec
  folio lint --json                Machine-readable output
  folio lint --strict              Exit 1 if any errors

Edits go in ~/.config/folio/stores/amendments/<topic>/.
folio sync opens a draft PR; merge via folio web.
`);
	process.exit(0);
}

const cmd = process.argv[2];
const args = process.argv.slice(3);

try {
	switch (cmd) {
		case "bind":
			cmdBind(args);
			break;
		case "switch":
			cmdSwitch(args);
			break;
		case "sync":
			cmdSync(args);
			break;
		case "drop":
			cmdDrop(args);
			break;
		case "list":
			cmdList();
			break;
		case "status":
			cmdStatus();
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
