import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

/**
 * Pathless layout route that guards authenticated pages.
 * Any route inside `_authenticated/` is protected.
 */
export const Route = createFileRoute("/_authenticated")({
	beforeLoad: ({ context, location }) => {
		if (!context.userId) {
			throw redirect({
				to: "/login/github",
				search: { return_to: location.pathname },
			});
		}
	},
	component: Outlet,
});
