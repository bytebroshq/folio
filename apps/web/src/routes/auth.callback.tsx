import { env } from "cloudflare:workers";
import {
	exchangeOAuthCode,
	fetchInstallations,
	fetchUser,
} from "@folio/github";
import { createFileRoute } from "@tanstack/react-router";
import { setSessionCookie } from "#/server/session.server";
import {
	createSession,
	getOAuthReturnTo,
	upsertUser,
	verifyOAuthState,
} from "#/session";

export const Route = createFileRoute("/auth/callback")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);

				const code = url.searchParams.get("code");
				const state = url.searchParams.get("state");
				if (!code || !state) {
					return new Response("missing code or state", { status: 400 });
				}

				const db = env.DB as D1Database;
				const valid = await verifyOAuthState(db, state);
				if (!valid) {
					return new Response("invalid or expired state", { status: 403 });
				}

				const redirectUri = `${url.origin}/auth/callback`;

				// Exchange code for token
				let tokenResp: { access_token: string };
				try {
					tokenResp = await exchangeOAuthCode(
						code,
						env.GITHUB_CLIENT_ID,
						env.GITHUB_CLIENT_SECRET,
						redirectUri,
					);
				} catch {
					return new Response("failed to exchange code", { status: 502 });
				}

				// Fetch user info
				let githubUser: { id: number; login: string };
				try {
					githubUser = await fetchUser(tokenResp.access_token);
				} catch {
					return new Response("failed to fetch user", { status: 502 });
				}

				// Create user and session
				const userId = await upsertUser(db, githubUser.id, githubUser.login);
				const sessionId = await createSession(db, userId);
				setSessionCookie(sessionId);

				// Discover installations
				try {
					const installations = await fetchInstallations(
						tokenResp.access_token,
					);
					for (const inst of installations) {
						const existing = await db
							.prepare(
								"SELECT id FROM installations WHERE user_id = ? AND installation_id = ?",
							)
							.bind(userId, inst.id)
							.first();

						if (!existing) {
							const installId = crypto.randomUUID();
							await db
								.prepare(
									"INSERT INTO installations (id, user_id, installation_id, account_id, created_at) VALUES (?, ?, ?, ?, ?)",
								)
								.bind(installId, userId, inst.id, inst.account.id, Date.now())
								.run();
						}
					}
				} catch {
					// non-fatal
				}

				const returnTo = (await getOAuthReturnTo(db, state)) || "/setup/repos";

				return new Response(null, {
					status: 302,
					headers: { Location: returnTo },
				});
			},
		},
	},
});
