/**
 * GitHub OAuth + App integration helpers.
 *
 * These functions are designed to run inside a Cloudflare Worker.
 * Callers pass the necessary secrets and tokens explicitly.
 */

// ── Shared headers ─────────────────────────────────────────────────

function gitHubHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		"User-Agent": "folio-web",
		Accept: "application/vnd.github+json",
	};
}

// ── OAuth ──────────────────────────────────────────────────────────

type GitHubTokenResponse = {
	access_token: string;
	token_type: string;
	scope: string;
};

type GitHubUser = {
	id: number;
	login: string;
};

/**
 * Exchange an OAuth authorization code for an access token.
 */
export async function exchangeOAuthCode(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string,
): Promise<GitHubTokenResponse> {
	const resp = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: { Accept: "application/json", "User-Agent": "folio-web" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			redirect_uri: redirectUri,
		}),
	});
	if (!resp.ok)
		throw new Error(
			`OAuth token exchange failed: ${resp.status} ${await resp.text()}`,
		);
	return resp.json<GitHubTokenResponse>();
}

/**
 * Fetch the authenticated GitHub user.
 */
export async function fetchUser(accessToken: string): Promise<GitHubUser> {
	const resp = await fetch("https://api.github.com/user", {
		headers: gitHubHeaders(accessToken),
	});
	if (!resp.ok)
		throw new Error(`fetchUser failed: ${resp.status} ${await resp.text()}`);
	return resp.json<GitHubUser>();
}

/**
 * List the user's GitHub App installations.
 * GET /user/installations requires a user-to-server token scoped for the app.
 */
export async function fetchInstallations(
	accessToken: string,
): Promise<{ id: number; account: { id: number; login: string } }[]> {
	const resp = await fetch("https://api.github.com/user/installations", {
		headers: gitHubHeaders(accessToken),
	});
	if (!resp.ok) return []; // user may not have any installations
	const data = await resp.json<{ installations: unknown[] }>();
	return (data.installations || []) as {
		id: number;
		account: { id: number; login: string };
	}[];
}

/**
 * List repositories accessible to a given installation.
 */
export async function fetchInstallationRepos(
	installationId: number,
	appId: string,
	privateKey: string,
): Promise<string[]> {
	const token = await mintInstallationToken(installationId, appId, privateKey);
	const resp = await fetch(`https://api.github.com/installation/repositories`, {
		headers: gitHubHeaders(token),
	});
	const data = await resp.json<{ repositories: { full_name: string }[] }>();
	return (data.repositories || []).map((r) => r.full_name);
}

/**
 * Check whether an installation can reach a specific repo.
 */
export async function checkRepoAccess(
	owner: string,
	repo: string,
	installationId: number,
	appId: string,
	privateKey: string,
): Promise<boolean> {
	const token = await mintInstallationToken(installationId, appId, privateKey);
	const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
		headers: gitHubHeaders(token),
	});
	return resp.ok;
}

/**
 * Mint an installation access token for the GitHub App.
 */
export async function mintInstallationToken(
	installationId: number,
	appId: string,
	privateKey: string,
): Promise<string> {
	const jwt = await signAppJwt(appId, privateKey);
	const resp = await fetch(
		`https://api.github.com/app/installations/${installationId}/access_tokens`,
		{
			method: "POST",
			headers: gitHubHeaders(jwt),
		},
	);
	if (!resp.ok)
		throw new Error(
			`mintInstallationToken failed: ${resp.status} ${await resp.text()}`,
		);
	const data = await resp.json<{ token: string }>();
	return data.token;
}

// ── App JWT signing ────────────────────────────────────────────────

/**
 * Sign a short-lived JWT to authenticate as a GitHub App.
 * Uses RS256 with the app's private key.
 */
async function signAppJwt(
	appId: string,
	privateKeyPem: string,
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const header = { alg: "RS256", typ: "JWT" };

	const payload = {
		iat: now - 60,
		exp: now + 600,
		iss: appId,
	};

	const encoder = new TextEncoder();

	const pemHeader = "-----BEGIN RSA PRIVATE KEY-----";
	const pemFooter = "-----END RSA PRIVATE KEY-----";
	const pemContent = privateKeyPem
		.replace(pemHeader, "")
		.replace(pemFooter, "")
		.replace(/\s/g, "");
	const binaryDer = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

	const key = (await crypto.subtle.importKey(
		"pkcs8",
		binaryDer.buffer,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	)) as CryptoKey;

	const b64 = (obj: object) =>
		btoa(JSON.stringify(obj))
			.replace(/=/g, "")
			.replace(/\+/g, "-")
			.replace(/\//g, "_");
	const message = `${b64(header)}.${b64(payload)}`;

	const signature = await crypto.subtle.sign(
		{ name: "RSASSA-PKCS1-v1_5" },
		key,
		encoder.encode(message),
	);

	const b64sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
		.replace(/=/g, "")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");

	return `${message}.${b64sig}`;
}
