import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/admin-orders` is the canonical entry point for the order command center.
 * It redirects to the full Order Operations Center at `/admin-orders-ops`,
 * keeping a single source of truth for the enterprise drawer + action center.
 */
export const Route = createFileRoute("/admin-orders")({
  beforeLoad: () => {
    throw redirect({ to: "/admin-orders-ops" });
  },
});
