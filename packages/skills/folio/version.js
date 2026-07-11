#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function version() {
	return "folio 0.3.7";
}

if (process.argv[2] === "--is-cli-match") {
	let actual;
	try {
		actual = execFileSync("folio", ["--version"], {
			encoding: "utf-8",
		}).trim();
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			console.error("Folio CLI is not installed; use the manual workflow.");
			process.exit(2);
		}
		console.error("Could not determine the installed Folio CLI version.");
		process.exit(2);
	}

	if (actual !== version()) {
		console.error(`Folio skill expects ${version()}; found ${actual}.`);
		process.exit(1);
	}

	process.exit(0);
}

console.log(version());
