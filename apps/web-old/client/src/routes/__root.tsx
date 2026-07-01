import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import type { RouterContext } from "../main";

export const Route = createRootRoute<RouterContext>({
  beforeLoad: async () => {
    try {
      const res = await fetch("/api/user", { credentials: "include" });
      const data = await res.json();
      return { userId: (data?.userId ?? null) as string | null };
    } catch {
      return { userId: null };
    }
  },
  component: () => {
    const { userId } = Route.useRouteContext();

    return (
      <>
        <header className="border-b border-zinc-800 px-6 py-4">
          <nav className="flex items-center gap-6">
            <Link to="/" className="font-bold text-lg no-underline text-white">
              Folio
            </Link>
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
                href={`/login/github?return_to=${encodeURIComponent(window.location.pathname)}`}
                className="text-zinc-400 hover:text-white no-underline text-sm"
              >
                Log in with GitHub
              </a>
            )}
          </nav>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </>
    );
  },
});
