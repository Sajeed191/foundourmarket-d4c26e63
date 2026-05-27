import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/pages/returns")({
  head: () => ({
    meta: [{ title: "Return Eligibility Center — FoundOurMarket™" }],
  }),
  component: PagesReturnsAliasPage,
});

function PagesReturnsAliasPage() {
  return <Navigate to="/returns" replace />;
}