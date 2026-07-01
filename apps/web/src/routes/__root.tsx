import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import appCss from "../styles.css?url";
import { getSessionUserId } from "#/session.functions";

export interface RouterContext {
  userId: string | null;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    try {
      const userId = await getSessionUserId();
      return { userId };
    } catch {
      return { userId: null };
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "Folio" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { userId } = Route.useRouteContext();

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">
        <header className="border-b border-zinc-800 px-6 py-4">
          <nav className="flex items-center gap-6 max-w-4xl mx-auto">
            <a href="/" className="font-bold text-lg no-underline text-white">
              Folio
            </a>
            <div className="flex-1" />
            {userId ? (
              <a
                href="/logout"
                className="text-zinc-400 hover:text-white no-underline text-sm"
              >
                Log out
              </a>
            ) : (
              <a
                href={`/login/github?return_to=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
                className="text-zinc-400 hover:text-white no-underline text-sm"
              >
                Log in with GitHub
              </a>
            )}
          </nav>
        </header>
        <main className="p-6 max-w-4xl mx-auto">
          {children}
        </main>
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
