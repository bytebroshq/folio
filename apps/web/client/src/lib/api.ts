export async function api(path: string, init?: RequestInit): Promise<unknown> {
  const resp = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json", ...init?.headers },
    ...init,
  });
  if (!resp.ok) {
    throw new Error(`${resp.status}: ${await resp.text()}`);
  }
  // If response is JSON, parse it. Otherwise return text.
  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("application/json")) return resp.json();
  return resp.text();
}

export function apiUrl(path: string): string {
  // In dev, the Worker may be on a different port. In production, same origin.
  return path;
}
