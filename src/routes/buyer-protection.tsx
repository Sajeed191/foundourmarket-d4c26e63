import { createFileRoute } from "@tanstack/react-router";
import {
  BadgeCheck, ShieldCheck, Wallet, RotateCcw, Lock, PackageSearch,
  Truck, Headset, CreditCard, Scale,
} from "lucide-react";
import { DocPage, FeatureCards, CheckList, type DocSection } from "@/components/site/DocPage";
import { PolicyCrossLinks } from "@/components/site/PolicyLinks";

export const Route = createFileRoute("/buyer-protection")({
  head: () => ({
    meta: [
      { title: "Buyer Protection — FoundOurMarket™" },
      { name: "description", content: "Every FoundOurMarket™ order is covered by Buyer Protection: secure payments, guaranteed delivery, easy refunds and dispute support." },
      { property: "og:title", content: "Buyer Protection — FoundOurMarket™" },
      { property: "og:description", content: "Shop with confidence — secure payments, guaranteed delivery and fair refunds on every order." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://foundourmarket.com/buyer-protection" },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/buyer-protection" }],
  }),
  component: BuyerProtectionPage,
});

function BuyerProtectionPage() {
  const sections: DocSection[] = [
    {
      id: "covered",
      label: "What's Covered",
      icon: ShieldCheck,
      node: (
        <FeatureCards
          items={[
            { icon: PackageSearch, title: "Item Not Received", desc: "Full refund if your order never arrives." },
            { icon: Scale, title: "Not as Described", desc: "Refund or replacement if it doesn't match the listing." },
            { icon: RotateCcw, title: "Damaged on Arrival", desc: "Covered for replacement within the return window." },
            { icon: Wallet, title: "Fair Refunds", desc: "Money back to your original payment method." },
          ]}
        />
      ),
    },
    {
      id: "secure",
      label: "Secure by Design",
      icon: Lock,
      node: (
        <FeatureCards
          items={[
            { icon: Lock, title: "Encrypted Payments", desc: "Bank-grade SSL on every transaction." },
            { icon: CreditCard, title: "Trusted Processors", desc: "Stripe & PayPal handle your card data." },
            { icon: Truck, title: "Tracked Delivery", desc: "Door-to-door tracking on all orders." },
            { icon: Headset, title: "Human Support", desc: "Real help, 7 days a week." },
          ]}
        />
      ),
    },
    {
      id: "how",
      label: "How to Make a Claim",
      icon: BadgeCheck,
      node: (
        <CheckList
          items={[
            { title: "Contact Support", desc: "Reach us within the return window with your Order ID." },
            { title: "Share Details", desc: "Describe the issue and add photos where relevant." },
            { title: "Get a Resolution", desc: "We approve a refund, replacement or repair." },
            { title: "Receive Your Refund", desc: "Issued to your original method in 5–7 business days." },
          ]}
        />
      ),
    },
  ];

  return (
    <DocPage
      eyebrow="Buyer Protection"
      title="Shop with Total Confidence"
      subtitle="Every order, guaranteed."
      description="FoundOurMarket™ Buyer Protection safeguards your purchases from checkout to delivery — and beyond. If something goes wrong, we make it right."
      badges={[
        { icon: ShieldCheck, label: "Protected Orders" },
        { icon: Lock, label: "Secure Payments" },
        { icon: Wallet, label: "Fair Refunds" },
      ]}
      sections={sections}
      related={
        <PolicyCrossLinks
          title="Related policies"
          keys={["refund", "return", "shipping", "contact"]}
        />
      }
      ctas={[{ to: "/returns", label: "Start a Return", primary: true }, { to: "/contact", label: "Contact Support" }]}
    />
  );
}
