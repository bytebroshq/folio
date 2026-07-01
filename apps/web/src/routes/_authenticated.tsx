import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";

/**
 * Pathless layout route that guards authenticated pages.
 * Any route inside `_authenticated/` is protected.
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context }) => {
    if (!context.userId) {
      throw redirect({
        to: "/login/github",
        search: { return_to: typeof window !== "undefined" ? window.location.pathname : "/" },
      } as any);
    }
  },
  component: Outlet,
});
