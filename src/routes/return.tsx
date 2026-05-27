import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/return")({
  head: () => ({
    meta: [{ title: "Return Eligibility Center — FoundOurMarket™" }],
  }),
  component: ReturnAliasPage,
});

function ReturnAliasPage() {
  return <Navigate to="/returns" replace />;
}