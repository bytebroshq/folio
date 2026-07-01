import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/logout")({
  server: {
    handlers: {
      GET: async () => {
        const { env } = await import("cloudflare:workers");
        const { clearSessionCookie, readSessionToken } = await import(
          "#/session.server"
        );

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
