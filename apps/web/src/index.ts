import { Hono } from "hono";
import { RepoObject } from "./repo-object";
import {
  setSessionCookie,
  clearSessionCookie,
  resolveSession,
  createSession,
  upsertUser,
  saveOAuthState,
  verifyOAuthState,
  getOAuthReturnTo,
} from "./session";
import {
  exchangeOAuthCode,
  fetchUser,
  fetchInstallations,
} from "@folio/github";

type Bindings = {
  DB: D1Database;
  REPO_DO: DurableObjectNamespace<RepoObject>;
  ASSETS: Fetcher;
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

// ── Auth (server-side only, no SPA involvement) ──────────────────

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

  let githubUser: { id: number; login: string };
  try {
    githubUser = await fetchUser(tokenResp.access_token);
  } catch {
    return c.text("failed to fetch user", 502);
  }

  const userId = await upsertUser(c.env.DB, githubUser.id);
  const sessionId = await createSession(c.env.DB, userId);
  setSessionCookie(c, sessionId);

  let installations: { id: number; account: { id: number; login: string } }[] = [];
  try {
    installations = await fetchInstallations(tokenResp.access_token);
  } catch {
    // non-fatal
  }

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

  // Where to return after login
  const oauthReturnTo = await getOAuthReturnTo(c.env.DB, state);
  const returnTo = oauthReturnTo || "/setup/repos";

  return c.redirect(returnTo);
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

// ── Repo (gated entry point) ─────────────────────────────────────

app.get("/repos/:owner/:repo", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    const loginUrl = `/login/github?return_to=${encodeURIComponent(new URL(c.req.url).pathname)}`;
    return c.redirect(loginUrl);
  }
  const { owner, repo } = c.req.param();
  // TODO: resolve installation, route to RepoObject
  return c.text(`${owner}/${repo} — not yet implemented`, 501);
});

// ── API ──────────────────────────────────────────────────────────

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.get("/api/user", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ userId: null });
  return c.json({ userId });
});

app.get("/api/installations", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const installs = await c.env.DB.prepare(
    "SELECT id, installation_id, account_id FROM installations WHERE user_id = ?",
  ).bind(userId).all();

  return c.json(installs.results);
});

// ── SPA fallback ─────────────────────────────────────────────────

app.get("/setup/*", async (c) => {
  const spa = await c.env.ASSETS.fetch(
    new URL("/index.html", c.req.url),
  );
  return new Response(spa.body, {
    status: spa.status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});

app.get("/repos/*", async (c) => {
  const spa = await c.env.ASSETS.fetch(
    new URL("/index.html", c.req.url),
  );
  return new Response(spa.body, {
    status: spa.status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});

// ── Root ─────────────────────────────────────────────────────────

app.get("/", async (c) => {
  const spa = await c.env.ASSETS.fetch(
    new URL("/index.html", c.req.url),
  );
  return new Response(spa.body, {
    status: spa.status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});

export default app;
export { RepoObject };
