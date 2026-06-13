import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/shipping-policy")({
  head: () => ({
    meta: [{ title: "Shipping Policy — FoundOurMarket™" }],
  }),
  component: ShippingPolicyAliasPage,
});

function ShippingPolicyAliasPage() {
  return <Navigate to="/pages/shipping" replace />;
}
