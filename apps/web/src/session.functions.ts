import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { readSessionToken } from "#/server/session.server";

/**
 * Resolve the current session from cookie.
 * Returns user id or null.
 */
export const getSessionUserId = createServerFn({ method: "GET" }).handler(
	async () => {
		const token = readSessionToken();
		if (!token) return null;

		const db = env.DB as D1Database;
		const session = await db
			.prepare(
				"SELECT user_id, expires_at FROM sessions WHERE id = ? AND expires_at > ?",
			)
			.bind(token, Date.now())
			.first<{ user_id: string; expires_at: number }>();

		if (!session) return null;

		const user = await db
			.prepare("SELECT id FROM users WHERE id = ?")
			.bind(session.user_id)
			.first<{ id: string }>();

		return user?.id ?? null;
	},
);
