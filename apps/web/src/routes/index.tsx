import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Folio</h1>
      <p className="text-zinc-400 mb-4">
        Git-as-memory — your knowledgebase, version-controlled.
      </p>
      <p className="text-zinc-500 text-sm">
        Use{" "}
        <code className="text-zinc-300 px-1 py-0.5 bg-zinc-800 rounded text-xs">
          folio web
        </code>{" "}
        to open this app from the CLI.
      </p>
    </div>
  );
}
