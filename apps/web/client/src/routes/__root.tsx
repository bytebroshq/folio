import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { api } from "../lib/api";
import { useEffect, useState } from "react";

function useAuth() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/user")
      .then((data: any) => setUserId(data?.userId ?? null))
      .catch(() => setUserId(null))
      .finally(() => setLoading(false));
  }, []);

  return { userId, loading };
}

export const Route = createRootRoute({
  component: () => {
    const { userId, loading } = useAuth();

    return (
      <>
        <header className="border-b border-zinc-800 px-6 py-4">
          <nav className="flex items-center gap-6">
            <Link to="/" className="font-bold text-lg no-underline">
              Folio
            </Link>
            <div className="flex-1" />
            {!loading && (
              userId ? (
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
              )
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
