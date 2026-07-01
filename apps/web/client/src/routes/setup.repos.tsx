import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/setup/repos")({
  component: () => (
    <div>
      <h2 className="text-xl font-semibold mb-4">Connected Repos</h2>
      <p className="text-zinc-400">
        Loading your connected repositories...
      </p>
    </div>
  ),
});
