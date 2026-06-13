import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/return-policy")({
  head: () => ({
    meta: [{ title: "Return Policy — FoundOurMarket™" }],
  }),
  component: ReturnPolicyAliasPage,
});

function ReturnPolicyAliasPage() {
  return <Navigate to="/returns" replace />;
}
