import { createFileRoute } from "@tanstack/react-router";
import { getInstallations } from "#/server/functions";

type Installation = {
  id: string;
  installation_id: number;
  account_id: number | null;
};

export const Route = createFileRoute("/_authenticated/setup/repos")({
  loader: () => getInstallations(),
  errorComponent: ({ error }) => (
    <p className="text-red-400">Error: {error.message}</p>
  ),
  pendingComponent: () => (
    <p className="text-zinc-400">Loading...</p>
  ),
  component: SetupRepos,
});

function SetupRepos() {
  const installations = Route.useLoaderData() as Installation[];

  if (installations.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Connected Repos</h2>
        <p className="text-zinc-400 mb-4">
          No GitHub App installations found.
        </p>
        <p className="text-zinc-500 text-sm">
          Install the Folio GitHub App on your account, then{" "}
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
        {installations.map((inst) => (
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
}
