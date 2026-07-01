import { run } from "./git";

export function openBrowser(url: string): void {
	try {
		run(
			`open "${url}" 2>/dev/null || xdg-open "${url}" 2>/dev/null || echo "open ${url}"`,
			{ quiet: true },
		);
	} catch {
		console.log(url);
	}
}
