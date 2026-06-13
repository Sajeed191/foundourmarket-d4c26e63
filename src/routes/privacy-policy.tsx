import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [{ title: "Privacy Policy — FoundOurMarket™" }],
  }),
  component: PrivacyPolicyAliasPage,
});

function PrivacyPolicyAliasPage() {
  return <Navigate to="/privacy" replace />;
}
