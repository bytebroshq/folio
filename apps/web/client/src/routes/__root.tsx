import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

export const Route = createRootRoute({
  component: () => (
    <>
      <header className="border-b border-zinc-800 px-6 py-4">
        <nav className="flex items-center gap-6">
          <Link to="/" className="font-bold text-lg no-underline">
            Folio
          </Link>
          <a
            href="/login/github"
            className="text-zinc-400 hover:text-white no-underline text-sm"
          >
            Login
          </a>
          <Link
            to="/setup/repos"
            className="text-zinc-400 hover:text-white no-underline text-sm"
          >
            Repos
          </Link>
        </nav>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
      <TanStackRouterDevtools />
    </>
  ),
});
