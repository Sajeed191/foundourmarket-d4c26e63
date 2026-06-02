import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin-product/$slug")({
  head: () => ({ meta: [{ title: "Product Editor — Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: () => <Outlet />,
});
