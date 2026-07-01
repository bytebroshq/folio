import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";

/**
 * Parse the session token from the current request's Cookie header.
 * Server-only — import this from .server.ts or createServerFn handlers.
 */
export function readSessionToken(): string | null {
  const header = getRequestHeader("cookie");
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === "folio_sid") return part.slice(eq + 1);
  }
  return null;
}

/**
 * Set a session cookie on the response.
 */
export function setSessionCookie(token: string): void {
  const ttl = Math.floor((7 * 24 * 60 * 60 * 1000) / 1000);
  setResponseHeader(
    "Set-Cookie",
    [
      "folio_sid=" + token,
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Path=/",
      "Max-Age=" + ttl,
    ].join("; "),
  );
}

/**
 * Clear the session cookie.
 */
export function clearSessionCookie(): void {
  setResponseHeader(
    "Set-Cookie",
    "folio_sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  );
}
