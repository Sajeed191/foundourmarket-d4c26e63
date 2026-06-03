import { createFileRoute } from "@tanstack/react-router";
import {
  FileCheck, UserCircle, ShoppingCart, Coins, Truck, RotateCcw,
  Copyright, Ban, UserX, Scale, Gavel, Mail, ShieldCheck, IndianRupee, DollarSign,
} from "lucide-react";
import { DocPage, CheckList, type DocSection } from "@/components/site/DocPage";
import { PolicyCrossLinks } from "@/components/site/PolicyLinks";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — FoundOurMarket™" },
      { name: "description", content: "The guidelines for using FoundOurMarket™ — accounts, orders, payments, pricing, shipping, returns and your rights as a customer." },
      { property: "og:title", content: "Terms & Conditions — FoundOurMarket™" },
      { property: "og:description", content: "Clear, fair guidelines for using the FoundOurMarket™ global marketplace." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://foundourmarket.com/terms" },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  const sections: DocSection[] = [
    {
      id: "acceptance",
      label: "Acceptance of Terms",
      icon: FileCheck,
      node: <p>By accessing or using FoundOurMarket™, you agree to these Terms & Conditions. If you do not agree, please discontinue use of the platform. We may update these terms periodically, and continued use means you accept the changes.</p>,
    },
    {
      id: "accounts",
      label: "User Accounts",
      icon: UserCircle,
      node: <p>You are responsible for keeping your account credentials secure and for all activity under your account. Provide accurate information and notify us immediately of any unauthorized use.</p>,
    },
    {
      id: "orders",
      label: "Orders & Payments",
      icon: ShoppingCart,
      node: <p>All orders are subject to acceptance and availability. Payment must be completed at checkout through our secure providers. We reserve the right to cancel orders in cases of pricing errors, suspected fraud or stock issues, with a full refund where applicable.</p>,
    },
    {
      id: "pricing",
      label: "Pricing & Currency",
      icon: Coins,
      node: (
        <div className="space-y-4">
          <p>Prices are shown in your applicable currency based on your region. Taxes and shipping are calculated at checkout.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card-premium rounded-2xl p-5">
              <span className="grid size-9 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent"><IndianRupee className="size-5" /></span>
              <h3 className="mt-3 text-[15px] font-display font-semibold">Indian Users</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">Prices and payments are processed in <span className="text-foreground font-medium">INR (₹)</span>.</p>
            </div>
            <div className="card-premium rounded-2xl p-5">
              <span className="grid size-9 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent"><DollarSign className="size-5" /></span>
              <h3 className="mt-3 text-[15px] font-display font-semibold">International Users</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">Prices and payments are processed in <span className="text-foreground font-medium">USD ($)</span>.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "shipping",
      label: "Shipping Policy",
      icon: Truck,
      node: <p>We ship worldwide through trusted logistics partners. Delivery timelines vary by destination and are estimated at checkout. Tracking is provided once your order ships.</p>,
    },
    {
      id: "returns",
      label: "Returns & Refunds",
      icon: RotateCcw,
      node: <p>Eligible items may be returned within the stated return window in their original condition. Approved refunds are issued to your original payment method. Certain items may be non-returnable for hygiene or safety reasons.</p>,
    },
    {
      id: "ip",
      label: "Intellectual Property",
      icon: Copyright,
      node: <p>All content on FoundOurMarket™ — including logos, text, graphics and design — is owned by or licensed to us and protected by intellectual property laws. You may not reuse it without permission.</p>,
    },
    {
      id: "prohibited",
      label: "Prohibited Activities",
      icon: Ban,
      node: (
        <CheckList
          items={[
            { title: "Fraudulent activity", desc: "Using the platform to deceive or defraud." },
            { title: "Abuse or misuse", desc: "Disrupting the service or other users." },
            { title: "Unauthorized access", desc: "Attempting to breach our systems." },
            { title: "Reselling without consent", desc: "Misusing content, data or listings." },
          ]}
        />
      ),
    },
    {
      id: "suspension",
      label: "Account Suspension",
      icon: UserX,
      node: <p>We may suspend or terminate accounts that violate these terms, engage in fraudulent behaviour or pose a risk to the platform or other customers.</p>,
    },
    {
      id: "liability",
      label: "Limitation of Liability",
      icon: Scale,
      node: <p>FoundOurMarket™ is provided on an "as available" basis. To the maximum extent permitted by law, we are not liable for indirect or consequential damages arising from use of the platform.</p>,
    },
    {
      id: "disputes",
      label: "Dispute Resolution",
      icon: Gavel,
      node: <p>We aim to resolve concerns quickly and fairly. Any disputes will be handled in good faith and, where required, in accordance with applicable laws of the governing jurisdiction.</p>,
    },
    {
      id: "contact",
      label: "Contact Information",
      icon: Mail,
      node: (
        <div className="space-y-4">
          <p>Questions about these terms? Our team is here to help.</p>
          <div className="card-premium rounded-2xl p-5">
            <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Support</p>
            <a href="mailto:support@foundourmarket.com" className="mt-1 inline-block text-base font-display font-semibold text-accent hover:underline">
              support@foundourmarket.com
            </a>
          </div>
        </div>
      ),
    },
  ];

  return (
    <DocPage
      eyebrow="Terms & Conditions"
      title="Terms & Conditions"
      subtitle="Guidelines for using FoundOurMarket™"
      description="Please read these terms carefully. They govern your use of the FoundOurMarket™ marketplace and explain your rights and responsibilities as a customer."
      badges={[
        { icon: ShieldCheck, label: "Fair & Transparent" },
        { icon: Scale, label: "Customer Protected" },
      ]}
      sections={sections}
      related={<PolicyCrossLinks keys={["privacy", "refund", "shipping", "contact", "help"]} />}
      ctas={[{ to: "/", label: "Back to Shopping", primary: true }]}
    />
  );
}
