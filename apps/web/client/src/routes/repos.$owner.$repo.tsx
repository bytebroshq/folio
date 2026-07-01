import { createFileRoute } from "@tanstack/react-router";
import { api } from "../lib/api";
import { useEffect, useState } from "react";

type RepoMeta = {
  owner: string;
  repo: string;
  defaultBranch: string;
};

export const Route = createFileRoute("/repos/$owner/$repo")({
  component: () => {
    const { owner, repo } = Route.useParams();
    const [meta, setMeta] = useState<RepoMeta | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      api(`/api/repos/${owner}/${repo}/meta`)
        .then((data) => setMeta(data as RepoMeta))
        .catch((e) => {
          if (e.message.includes("401")) {
            window.location.href = `/login/github?return_to=/repos/${owner}/${repo}`;
            return;
          }
          setError(e.message);
        });
    }, [owner, repo]);

    if (error) {
      return <p className="text-red-400">Error: {error}</p>;
    }

    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">
          <span className="text-zinc-500">{owner}</span>/{repo}
        </h1>
        {meta && (
          <p className="text-zinc-400 text-sm mb-6">
            default branch: {meta.defaultBranch}
          </p>
        )}
        <p className="text-zinc-500">PR inbox coming in Phase 2.</p>
      </div>
    );
  },
});
