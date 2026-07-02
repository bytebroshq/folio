import { resolve } from "node:path";
import type { Wikilink } from "./types";

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

export function extractWikilinks(content: string): Wikilink[] {
	const results: Wikilink[] = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		for (const match of lines[i].matchAll(WIKILINK_RE)) {
			results.push({ link: match[1].trim(), line: i + 1 });
		}
	}
	return results;
}

export function cleanLinkTarget(link: string): string {
	return link.replace(/#.*$/, "").replace(/\.md$/, "").trim();
}

export function hasRelativePathMarker(link: string): boolean {
	const clean = cleanLinkTarget(link);
	return (
		clean === "." ||
		clean === ".." ||
		clean.startsWith("./") ||
		clean.startsWith("../")
	);
}

export function isPathLink(link: string): boolean {
	const clean = cleanLinkTarget(link);
	return clean.includes("/");
}

export function targetPath(storeDir: string, link: string): string {
	const clean = cleanLinkTarget(link);
	return resolve(storeDir, `${clean}.md`);
}
