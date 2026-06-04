import { createFileRoute } from "@tanstack/react-router";
import {
  Mail, MessageCircle, Clock, MapPin, Headset, ShieldCheck, Phone, Globe,
} from "lucide-react";
import { DocPage, FeatureCards, type DocSection } from "@/components/site/DocPage";
import { PolicyCrossLinks } from "@/components/site/PolicyLinks";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us — FoundOurMarket™" },
      { name: "description", content: "Get in touch with the FoundOurMarket™ support team by email or WhatsApp. Fast, friendly help with orders, returns, refunds and more." },
      { property: "og:title", content: "Contact Us — FoundOurMarket™" },
      { property: "og:description", content: "Reach our support team — typical response under 30 minutes." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://foundourmarket.com/contact" },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/contact" }],
  }),
  component: ContactPage,
});

const PHONES = ["+91 97458 44213", "+91 62820 88380", "+91 8714459240"];

function ContactPage() {
  const sections: DocSection[] = [
    {
      id: "channels",
      label: "Ways to Reach Us",
      icon: Headset,
      node: (
        <div className="space-y-4">
          <div className="card-premium rounded-2xl p-5">
            <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Email Support</p>
            <a href="mailto:support@foundourmarket.com" className="mt-1 inline-flex items-center gap-2 text-base font-display font-semibold text-accent hover:underline">
              <Mail className="size-4" /> support@foundourmarket.com
            </a>
            <p className="mt-1 text-[13px] text-muted-foreground">Typical response within 6 hours.</p>
          </div>
          <div className="card-premium rounded-2xl p-5">
            <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">WhatsApp</p>
            <ul className="mt-2 space-y-2">
              {PHONES.map((num) => (
                <li key={num}>
                  <a
                    href={`https://wa.me/${num.replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-accent transition-colors"
                  >
                    <MessageCircle className="size-4 text-accent" /> {num}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-muted-foreground">Available 8:00 AM – 11:00 PM IST.</p>
          </div>
        </div>
      ),
    },
    {
      id: "what",
      label: "How We Can Help",
      icon: ShieldCheck,
      node: (
        <FeatureCards
          items={[
            { icon: Clock, title: "Order Status", desc: "Tracking, delays and delivery questions." },
            { icon: ShieldCheck, title: "Returns & Refunds", desc: "Eligibility, requests and refund timelines." },
            { icon: Phone, title: "Account Help", desc: "Login, payments and profile support." },
            { icon: Globe, title: "General Enquiries", desc: "Partnerships, feedback and anything else." },
          ]}
        />
      ),
    },
    {
      id: "hours",
      label: "Support Hours",
      icon: Clock,
      node: (
        <p>
          Our team operates <span className="text-foreground font-medium">8:00 AM – 11:00 PM IST, 7 days a week</span>.
          Live chat and email are monitored throughout the day, and urgent order issues are prioritized.
          For the fastest help, include your Order ID and the email used at checkout.
        </p>
      ),
    },
  ];

  return (
    <DocPage
      eyebrow="Contact Us"
      title="We're Here to Help"
      subtitle="Real people, fast answers."
      description="Have a question about an order, a return, or anything else? Reach the FoundOurMarket™ team and we'll get back to you quickly."
      badges={[
        { icon: Clock, label: "< 30 min response" },
        { icon: Headset, label: "7 Days a Week" },
        { icon: MapPin, label: "Global Support" },
      ]}
      sections={sections}
      related={
        <PolicyCrossLinks
          title="Helpful links"
          keys={["privacy", "terms", "refund", "return", "help"]}
        />
      }
      ctas={[{ to: "/help", label: "Visit Help Center", primary: true }, { to: "/track", label: "Track an Order" }]}
    />
  );
}
