import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div>
      <h1 className="text-2xl font-bold mb-4">Folio</h1>
      <p className="text-zinc-400">Git-as-memory: review and control surface.</p>
    </div>
  ),
});
