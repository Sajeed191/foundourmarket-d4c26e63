import { createFileRoute } from "@tanstack/react-router";
import {
  Database, Settings2, Cookie, Lock, Network, UserCog, Mail,
  ShieldCheck, Globe, Fingerprint,
} from "lucide-react";
import { DocPage, CheckList, FeatureCards, type DocSection } from "@/components/site/DocPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy & Data Protection — FoundOurMarket™" },
      { name: "description", content: "Learn how FoundOurMarket™ collects, uses and protects your personal data. Encrypted payments, secure storage and full control over your information." },
      { property: "og:title", content: "Privacy Policy — FoundOurMarket™" },
      { property: "og:description", content: "Your privacy is important to us. Transparent data practices, strong security and clear user rights." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const sections: DocSection[] = [
    {
      id: "collect",
      label: "Information We Collect",
      icon: Database,
      node: (
        <CheckList
          items={[
            { title: "Personal Information", desc: "Name, email, shipping address and contact details you provide." },
            { title: "Payment Information", desc: "Processed securely by our payment partners — we never store full card numbers." },
            { title: "Device Information", desc: "Browser, device type and IP for security and optimization." },
            { title: "Usage Data", desc: "How you browse and shop, to improve your experience." },
          ]}
        />
      ),
    },
    {
      id: "use",
      label: "How We Use Information",
      icon: Settings2,
      node: (
        <CheckList
          items={[
            { title: "Order Processing", desc: "To fulfil, ship and manage your purchases." },
            { title: "Customer Support", desc: "To respond to questions and resolve issues." },
            { title: "Security", desc: "To protect your account and our platform." },
            { title: "Fraud Prevention", desc: "To detect and stop suspicious activity." },
            { title: "Marketing Preferences", desc: "Only when you opt in — and you can opt out anytime." },
          ]}
        />
      ),
    },
    {
      id: "cookies",
      label: "Cookies Policy",
      icon: Cookie,
      node: (
        <p>
          We use cookies and similar technologies to keep you signed in, remember your cart, understand how
          our marketplace is used, and improve performance. Essential cookies are required for the site to
          function; optional analytics and preference cookies help us refine your experience. You can control
          cookies through your browser settings at any time.
        </p>
      ),
    },
    {
      id: "security",
      label: "Data Security",
      icon: Lock,
      node: (
        <FeatureCards
          items={[
            { icon: Lock, title: "Encryption", desc: "Data is encrypted in transit and at rest." },
            { icon: Database, title: "Secure Storage", desc: "Stored on protected, monitored infrastructure." },
            { icon: Fingerprint, title: "Access Controls", desc: "Strict, role-based access to sensitive data." },
          ]}
        />
      ),
    },
    {
      id: "third-party",
      label: "Third-Party Services",
      icon: Network,
      node: (
        <CheckList
          items={[
            { title: "Payment Providers", desc: "To process transactions securely." },
            { title: "Analytics", desc: "To understand and improve our service." },
            { title: "Shipping Partners", desc: "To deliver your orders worldwide." },
          ]}
        />
      ),
    },
    {
      id: "rights",
      label: "Your Rights",
      icon: UserCog,
      node: (
        <CheckList
          items={[
            { title: "Access Data", desc: "Request a copy of the data we hold about you." },
            { title: "Update Data", desc: "Correct or update your information." },
            { title: "Delete Data", desc: "Ask us to erase your personal data." },
            { title: "Opt-Out", desc: "Withdraw consent for marketing at any time." },
          ]}
        />
      ),
    },
    {
      id: "contact",
      label: "Contact Information",
      icon: Mail,
      node: (
        <div className="space-y-4">
          <p>
            For privacy questions or data requests, reach our team and we'll respond promptly.
          </p>
          <div className="card-premium rounded-2xl p-5">
            <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Privacy & Data Requests</p>
            <a href="mailto:privacy@foundourmarket.com" className="mt-1 inline-block text-base font-display font-semibold text-accent hover:underline">
              privacy@foundourmarket.com
            </a>
          </div>
        </div>
      ),
    },
  ];

  return (
    <DocPage
      eyebrow="Privacy Policy"
      title="Privacy & Data Protection"
      subtitle="Your privacy is important to us."
      description="We are committed to protecting your personal information and being transparent about how we collect, use and safeguard your data."
      badges={[
        { icon: Lock, label: "SSL Secured" },
        { icon: ShieldCheck, label: "GDPR Aware" },
        { icon: Globe, label: "Privacy Focused" },
      ]}
      sections={sections}
      ctas={[{ to: "/", label: "Back to Shopping", primary: true }]}
    />
  );
}
