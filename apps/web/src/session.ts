import { createServerFn } from "@tanstack/react-start";

export type UserRow = {
  id: string;
  github_id: number;
  login: string;
  created_at: number;
};

export type SessionRow = {
  id: string;
  user_id: string;
  expires_at: number;
};

/**
 * Resolve the current session from cookie.
 * Uses createServerFn so it works in both SSR and client contexts.
 */
export const getSessionUserId = createServerFn({ method: "GET" }).handler(
  async () => {
    const { readSessionToken } = await import("#/server/session.server");
    const { env } = await import("cloudflare:workers");

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

/**
 * Create a new session for a user.
 */
export async function createSession(
  db: D1Database,
  userId: string,
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(sessionId, userId, expiresAt)
    .run();
  return sessionId;
}

/**
 * Upsert a GitHub user and return their internal id.
 */
export async function upsertUser(
  db: D1Database,
  githubId: number,
  login: string,
): Promise<string> {
  const existing = await db
    .prepare("SELECT id FROM users WHERE github_id = ?")
    .bind(githubId)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO users (id, github_id, login, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(id, githubId, login, Date.now())
    .run();
  return id;
}

/**
 * OAuth state management (CSRF protection).
 */
export async function saveOAuthState(
  db: D1Database,
  state: string,
  returnTo?: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO oauth_states (state, code_verifier, return_to, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(state, crypto.randomUUID(), returnTo || null, Date.now() + 10 * 60 * 1000)
    .run();
}

export async function verifyOAuthState(
  db: D1Database,
  state: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT expires_at FROM oauth_states WHERE state = ? AND expires_at > ?",
    )
    .bind(state, Date.now())
    .first<{ expires_at: number }>();
  if (!row) return false;
  await db.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  return true;
}

export async function getOAuthReturnTo(
  db: D1Database,
  state: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT return_to FROM oauth_states WHERE state = ?")
    .bind(state)
    .first<{ return_to: string | null }>();
  return row?.return_to ?? null;
}
