import { createFileRoute } from "@tanstack/react-router";
import { api } from "../lib/api";
import { useEffect, useState } from "react";

type Installation = {
  id: string;
  installation_id: number;
  account_id: number | null;
};

export const Route = createFileRoute("/setup/repos")({
  component: () => {
    const [installs, setInstalls] = useState<Installation[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      api("/api/installations")
        .then((data) => setInstalls(data as Installation[]))
        .catch((e) => {
          if (e.message.includes("401")) {
            window.location.href = "/login/github";
            return;
          }
          setError(e.message);
        })
        .finally(() => setLoading(false));
    }, []);

    if (loading) {
      return <p className="text-zinc-400">Loading...</p>;
    }

    if (error) {
      return <p className="text-red-400">Error: {error}</p>;
    }

    if (!installs || installs.length === 0) {
      return (
        <div>
          <h2 className="text-xl font-semibold mb-4">Connected Repos</h2>
          <p className="text-zinc-400 mb-4">
            No GitHub App installations found.
          </p>
          <p className="text-zinc-500 text-sm">
            <a
              href="https://github.com/apps/folio-web-dev/installations/new"
              className="text-blue-400 hover:underline"
              target="_blank"
            >
              Install the Folio GitHub App
            </a>{" "}
            on your account, then{" "}
            <a
              href="/login/github"
              className="text-blue-400 hover:underline"
            >
              re-login
            </a>{" "}
            to discover your repos.
          </p>
        </div>
      );
    }

    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Connected Repos</h2>
        <ul className="space-y-2">
          {installs.map((inst) => (
            <li
              key={inst.id}
              className="border border-zinc-800 rounded-lg p-3"
            >
              <span className="text-zinc-300">
                Installation #{inst.installation_id}
                {inst.account_id ? ` (account ${inst.account_id})` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  },
});
