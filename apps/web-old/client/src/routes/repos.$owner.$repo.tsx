import { createFileRoute, redirect } from "@tanstack/react-router";

type RepoMeta = {
  owner: string;
  repo: string;
  defaultBranch: string;
};

export const Route = createFileRoute("/repos/$owner/$repo")({
  beforeLoad: async ({ context, params }) => {
    if (!context.userId) {
      const returnTo = `/repos/${params.owner}/${params.repo}`;
      throw redirect({
        to: "/login/github",
        search: { return_to: returnTo },
      } as any);
    }
  },
  loader: async ({ params }) => {
    const res = await fetch(
      `/api/repos/${params.owner}/${params.repo}/meta`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json() as Promise<RepoMeta>;
  },
  component: ({ loaderData }) => {
    const { owner, repo } = loaderData;

    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">
          <span className="text-zinc-500">{owner}</span>/{repo}
        </h1>
        <p className="text-zinc-400 text-sm mb-6">
          default branch: {loaderData.defaultBranch}
        </p>
        <p className="text-zinc-500">PR inbox coming in Phase 2.</p>
      </div>
    );
  },
});
