import { createFileRoute } from "@tanstack/react-router";
import { getRepoMeta } from "#/server/installations.functions";

type RepoMeta = {
  owner: string;
  repo: string;
  defaultBranch: string;
};

export const Route = createFileRoute("/_authenticated/repos/$owner/$repo")({
  loader: async ({ params }) => {
    const meta = await getRepoMeta();
    return { ...params, ...meta } as RepoMeta;
  },
  component: RepoPage,
});

function RepoPage() {
  const data = Route.useLoaderData() as RepoMeta;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">
        <span className="text-zinc-500">{data.owner}</span>/{data.repo}
      </h1>
      <p className="text-zinc-400 text-sm mb-6">
        default branch: {data.defaultBranch}
      </p>
      <p className="text-zinc-500">PR inbox coming in Phase 2.</p>
    </div>
  );
}
