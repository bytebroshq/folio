import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { clearSessionCookie, readSessionToken } from "#/server/session.server";

export const Route = createFileRoute("/logout")({
	server: {
		handlers: {
			GET: async () => {
				const token = readSessionToken();
				if (token) {
					await (env.DB as D1Database)
						.prepare("DELETE FROM sessions WHERE id = ?")
						.bind(token)
						.run();
				}

				clearSessionCookie();

				return new Response(null, {
					status: 302,
					headers: { Location: "/" },
				});
			},
		},
	},
});
