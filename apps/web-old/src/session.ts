import type { Context } from "hono";

const SESSION_COOKIE = "folio_sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type UserRow = { id: string; github_id: number; created_at: number };
export type SessionRow = { id: string; user_id: string; expires_at: number };

/**
 * Set a session cookie on the response.
 */
export function setSessionCookie(c: Context, sessionId: string): void {
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
  );
}

/**
 * Clear the session cookie.
 */
export function clearSessionCookie(c: Context): void {
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  );
}

/**
 * Resolve a session from the request cookie.
 * Returns null if no valid session.
 */
export async function resolveSession(
  c: { env: { DB: D1Database }; req: { header: (name: string) => string | undefined } },
): Promise<{ user: UserRow; session: SessionRow } | null> {
  const cookie = c.req.header("cookie");
  if (!cookie) return null;

  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;

  const sessionId = match[1];

  const session = await c.env.DB.prepare(
    "SELECT id, user_id, expires_at FROM sessions WHERE id = ? AND expires_at > ?",
  )
    .bind(sessionId, Date.now())
    .first<SessionRow>();

  if (!session) return null;

  const user = await c.env.DB.prepare(
    "SELECT id, github_id, created_at FROM users WHERE id = ?",
  )
    .bind(session.user_id)
    .first<UserRow>();

  if (!user) return null;

  return { user, session };
}

/**
 * Create a new session for a user.
 */
export async function createSession(
  db: D1Database,
  userId: string,
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;

  await db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
  )
    .bind(sessionId, userId, expiresAt)
    .run();

  return sessionId;
}

/**
 * Upsert a GitHub user in the database and return their internal id.
 */
export async function upsertUser(
  db: D1Database,
  githubId: number,
): Promise<string> {
  const existing = await db.prepare(
    "SELECT id FROM users WHERE github_id = ?",
  )
    .bind(githubId)
    .first<{ id: string }>();

  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO users (id, github_id, created_at) VALUES (?, ?, ?)",
  )
    .bind(id, githubId, Date.now())
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
  await db.prepare(
    "INSERT INTO oauth_states (state, code_verifier, return_to, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(state, crypto.randomUUID(), returnTo || null, Date.now() + 10 * 60 * 1000)
    .run();
}

export async function verifyOAuthState(
  db: D1Database,
  state: string,
): Promise<boolean> {
  const row = await db.prepare(
    "SELECT expires_at FROM oauth_states WHERE state = ? AND expires_at > ?",
  )
    .bind(state, Date.now())
    .first<{ expires_at: number }>();

  if (!row) return false;

  await db.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  return true;
}

/**
 * Get the return_to URL stored with an OAuth state.
 */
export async function getOAuthReturnTo(
  db: D1Database,
  state: string,
): Promise<string | null> {
  const row = await db.prepare(
    "SELECT return_to FROM oauth_states WHERE state = ?",
  )
    .bind(state)
    .first<{ return_to: string | null }>();

  return row?.return_to ?? null;
}
