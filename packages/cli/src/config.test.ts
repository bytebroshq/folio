import { describe, expect, test } from "bun:test";
import { migrateLegacyConfig, parseConfigSnapshot } from "./config";

describe("v2 configuration migration", () => {
	test("converts the legacy flat binding and preserves its checkout", () => {
		const migrated = migrateLegacyConfig(
			[
				"remote: bytebroshq/operations",
				"store: git",
				"path: /tmp/operations",
				"strategy: pr",
				"skill: /tmp/skill",
			].join("\n"),
		);

		expect(migrated.version).toBe(2);
		expect(migrated.bindings.operations).toMatchObject({
			id: expect.stringMatching(/^bnd_[0-9a-f]{8}$/),
			description: "Folio knowledge block 'operations'.",
			path: "/tmp/operations",
			github: "bytebroshq/operations",
			strategy: "pr",
		});
		expect(migrated.skill.path).toBe("/tmp/skill");
	});

	test("uses the local directory name and merge strategy for a local legacy bind", () => {
		const migrated = migrateLegacyConfig("source: /tmp/personal\nstore: git\n");
		expect(migrated.bindings.personal.github).toBeNull();
		expect(migrated.bindings.personal.strategy).toBe("merge");
		expect(migrated.bindings.personal.path).toBe("/tmp/personal");
	});

	test("rejects unknown legacy keys without attempting migration", () => {
		expect(() =>
			migrateLegacyConfig("remote: owner/repo\nmalicious: value\n"),
		).toThrow(/invalid or unrecognized legacy/i);
	});

	test("rejects malformed v2 snapshots and duplicate sources", () => {
		const incomplete = `version: 2\n\nskill:\n  path: ""\n\namendments:\n  path: /tmp/amendments\n\nbindings:\n  one:\n    id: bnd_11111111\n    description: one\n    path: /tmp/one\n    github: owner/one\n`;
		expect(() => parseConfigSnapshot(incomplete)).toThrow(
			/incomplete|structure/i,
		);

		const duplicate = `version: 2\n\nskill:\n  path: ""\n\namendments:\n  path: /tmp/amendments\n\nbindings:\n  one:\n    id: bnd_11111111\n    description: one\n    path: /tmp/one\n    github: owner/shared\n    strategy: pr\n  two:\n    id: bnd_22222222\n    description: two\n    path: /tmp/two\n    github: owner/shared\n    strategy: pr\n`;
		expect(() => parseConfigSnapshot(duplicate)).toThrow(/duplicate github/i);
	});

	test("rejects unsupported versions and unknown v2 structure", () => {
		expect(() =>
			parseConfigSnapshot("version: 1\nremote: owner/repo\n"),
		).toThrow(/unsupported/i);
		expect(() => parseConfigSnapshot("version: 2\nunknown: value\n")).toThrow(
			/unknown|complete/i,
		);
	});

	test("rejects scalar container sections", () => {
		expect(() =>
			parseConfigSnapshot(
				"version: 2\nskill: nope\namendments:\n  path: /tmp/a\nbindings:\n",
			),
		).toThrow(/container section/i);
		expect(() =>
			parseConfigSnapshot(
				'version: 2\nskill: ""\namendments:\n  path: /tmp/a\nbindings:\n',
			),
		).toThrow(/container section/i);
	});
});
