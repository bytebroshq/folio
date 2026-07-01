import { createServerFn } from "@tanstack/react-start";

type Installation = {
  id: string;
  installation_id: number;
  account_id: number | null;
};

/**
 * Fetch installations for the current user.
 */
export const getInstallations = createServerFn({ method: "GET" }).handler(
  async () => {
    const { readSessionToken } = await import("#/session.server");
    const { env } = await import("cloudflare:workers");

    const token = readSessionToken();
    if (!token) return [] as Installation[];

    const db = env.DB as D1Database;
    const session = await db
      .prepare(
        "SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?",
      )
      .bind(token, Date.now())
      .first<{ user_id: string }>();

    if (!session) return [] as Installation[];

    const installs = await db
      .prepare(
        "SELECT id, installation_id, account_id FROM installations WHERE user_id = ?",
      )
      .bind(session.user_id)
      .all();

    return installs.results as Installation[];
  },
);

/**
 * Fetch basic repo metadata (placeholder).
 */
export const getRepoMeta = createServerFn({ method: "GET" }).handler(
  async () => {
    return { defaultBranch: "main" };
  },
);
