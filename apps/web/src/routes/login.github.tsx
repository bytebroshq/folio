import { createFileRoute } from "@tanstack/react-router";
import { saveOAuthState } from "#/session";

export const Route = createFileRoute("/login/github")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { env } = await import("cloudflare:workers");
        const url = new URL(request.url);
        const returnTo = url.searchParams.get("return_to") || "/setup/repos";

        const redirectUri = `${url.origin}/auth/callback`;
        const clientId = env.GITHUB_CLIENT_ID as string;
        const state = crypto.randomUUID();

        await saveOAuthState(env.DB as D1Database, state, returnTo);

        const githubUrl = new URL("https://github.com/login/oauth/authorize");
        githubUrl.searchParams.set("client_id", clientId);
        githubUrl.searchParams.set("redirect_uri", redirectUri);
        githubUrl.searchParams.set("state", state);
        githubUrl.searchParams.set("scope", "");

        return new Response(null, {
          status: 302,
          headers: { Location: githubUrl.toString() },
        });
      },
    },
  },
});
