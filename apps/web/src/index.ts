import { Hono } from "hono";
import { RepoObject } from "./repo-object";
import type { Context } from "hono";
import {
  setSessionCookie,
  clearSessionCookie,
  resolveSession,
  createSession,
  upsertUser,
  saveOAuthState,
  verifyOAuthState,
} from "./session";
import {
  exchangeOAuthCode,
  fetchUser,
  fetchInstallations,
} from "@folio/github";

type Bindings = {
  DB: D1Database;
  REPO_DO: DurableObjectNamespace<RepoObject>;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
};

type Variables = {
  userId: string | null;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Session middleware ────────────────────────────────────────────

app.use("*", async (c, next) => {
  const resolved = await resolveSession(c);
  c.set("userId", resolved?.user.id ?? null);
  await next();
});

// ── Auth ──────────────────────────────────────────────────────────

app.get("/login/github", async (c) => {
  const redirectUri = `${new URL(c.req.url).origin}/auth/callback`;
  const clientId = c.env.GITHUB_CLIENT_ID;
  const state = crypto.randomUUID();

  await saveOAuthState(c.env.DB, state);

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "");

  return c.redirect(url.toString());
});

app.get("/auth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text("missing code or state", 400);

  const valid = await verifyOAuthState(c.env.DB, state);
  if (!valid) return c.text("invalid or expired state", 403);

  const redirectUri = `${new URL(c.req.url).origin}/auth/callback`;

  // Exchange code for access token
  let tokenResp: { access_token: string };
  try {
    tokenResp = await exchangeOAuthCode(
      code,
      c.env.GITHUB_CLIENT_ID,
      c.env.GITHUB_CLIENT_SECRET,
      redirectUri,
    );
  } catch {
    return c.text("failed to exchange code", 502);
  }

  // Fetch GitHub user identity
  let githubUser: { id: number; login: string };
  try {
    githubUser = await fetchUser(tokenResp.access_token);
  } catch {
    return c.text("failed to fetch user", 502);
  }

  // Upsert user in our database
  const userId = await upsertUser(c.env.DB, githubUser.id);

  // Create session
  const sessionId = await createSession(c.env.DB, userId);
  setSessionCookie(c, sessionId);

  // Discover installations while we have the token
  let installations: { id: number; account: { id: number; login: string } }[] = [];
  try {
    installations = await fetchInstallations(tokenResp.access_token);
  } catch {
    // non-fatal — can rediscover later
  }

  // Store installations that the user can access
  for (const inst of installations) {
    const existing = await c.env.DB.prepare(
      "SELECT id FROM installations WHERE user_id = ? AND installation_id = ?",
    ).bind(userId, inst.id).first();

    if (!existing) {
      const installId = crypto.randomUUID();
      await c.env.DB.prepare(
        "INSERT INTO installations (id, user_id, installation_id, account_id, created_at) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(installId, userId, inst.id, inst.account.id, Date.now())
        .run();
    }
  }

  // Redirect to repo setup
  return c.redirect("/setup/repos");
});

app.get("/logout", async (c) => {
  const resolved = await resolveSession(c);
  if (resolved) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?")
      .bind(resolved.session.id)
      .run();
  }
  clearSessionCookie(c);
  return c.redirect("/");
});

// ── Setup ─────────────────────────────────────────────────────────

app.get("/setup/repos", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.redirect("/login/github");

  const installs = await c.env.DB.prepare(
    "SELECT id, installation_id, account_id FROM installations WHERE user_id = ?",
  ).bind(userId).all();

  let repoLinks: string[] = [];

  for (const inst of installs.results) {
    // TODO: fetch repos per installation via GitHub API
    repoLinks.push(`/installations/${inst.installation_id}`);
  }

  return c.html(`<!doctype html>
<html><head><meta charset="utf-8"><title>Folio — Repos</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font:14px/1.45 system-ui,sans-serif;background:#111;color:#eee;margin:32px}
a{color:#80c7ff}
</style>
</head><body>
<h1>Folio</h1>
<p>Connected installations: ${installs.results.length}</p>
<ul>${repoLinks.map((r) => `<li><a href="${r}">${r}</a></li>`).join("")}</ul>
<p><a href="/logout">Log out</a></p>
</body></html>`);
});

// ── Health ────────────────────────────────────────────────────────

app.get("/", (c) => c.text("folio web"));

app.get("/api/health", (c) => c.json({ status: "ok" }));

export default app;
export { RepoObject };
