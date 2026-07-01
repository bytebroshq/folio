import { Hono } from "hono";
import { RepoObject } from "./repo-object";

type Bindings = {
  DB: D1Database;
  REPO_DO: DurableObjectNamespace<RepoObject>;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
};

type Variables = {
  user: { id: string; github_id: number } | null;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Auth ──────────────────────────────────────────────────────────

app.get("/login/github", async (c) => {
  const redirectUri = `${new URL(c.req.url).origin}/auth/callback`;
  const clientId = c.env.GITHUB_CLIENT_ID;
  const state = crypto.randomUUID();
  // TODO: store state in D1 for CSRF protection

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

  // TODO: verify state against D1
  // TODO: exchange code for access token
  // TODO: fetch GitHub user id
  // TODO: upsert user, create session, set cookie
  // TODO: redirect to /setup/repos

  return c.text("auth callback — not yet implemented", 501);
});

app.get("/logout", async (c) => {
  // TODO: delete session, clear cookie
  return c.redirect("/");
});

// ── Setup ─────────────────────────────────────────────────────────

app.get("/setup/repos", async (c) => {
  // TODO: ensure authenticated session
  // TODO: fetch user's GitHub App installations
  // TODO: list repos per installation
  // TODO: render repo picker
  return c.text("repo setup — not yet implemented", 501);
});

// ── Repo ─────────────────────────────────────────────────────────

app.get("/repos/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  // TODO: resolve installation for this repo
  // TODO: route to RepoObject
  return c.text(`${owner}/${repo} — not yet implemented`, 501);
});

app.get("/repos/:owner/:repo/prs", async (c) => {
  return c.text("PR list — not yet implemented", 501);
});

app.get("/repos/:owner/:repo/prs/:number", async (c) => {
  return c.text("PR detail — not yet implemented", 501);
});

// ── Health ────────────────────────────────────────────────────────

app.get("/", (c) => c.text("folio web"));

app.get("/api/health", (c) => c.json({ status: "ok" }));

export default app;
export { RepoObject };
