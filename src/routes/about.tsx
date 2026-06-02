import { createFileRoute } from "@tanstack/react-router";
import {
  Target, Gem, ShieldCheck, Sparkles, Eye, HeartHandshake,
  Lock, Truck, RotateCcw, Headset, BadgeCheck, Globe,
  Rocket, History, ShieldHalf, CreditCard, PackageSearch, Wallet,
} from "lucide-react";
import { DocPage, StatGrid, FeatureCards, CheckList, Timeline, type DocSection } from "@/components/site/DocPage";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — FoundOurMarket™ | Global Premium Marketplace" },
      { name: "description", content: "FoundOurMarket™ is a global ecommerce marketplace bringing high-quality products from around the world to customers through a premium shopping experience." },
      { property: "og:title", content: "About FoundOurMarket™ — Everything You Need, All in One Place" },
      { property: "og:description", content: "Discover our mission, values and the global marketplace built for trust, quality and customer success." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const sections: DocSection[] = [
    {
      id: "mission",
      label: "Our Mission",
      icon: Target,
      node: (
        <div className="space-y-5">
          <p>
            We exist to make great products accessible to everyone, everywhere. By sourcing globally and
            obsessing over the customer experience, FoundOurMarket™ turns online shopping into something
            effortless, trustworthy and genuinely delightful.
          </p>
          <CheckList
            items={[
              { title: "Affordable products", desc: "Fair prices through smart global sourcing." },
              { title: "Global sourcing", desc: "Curated quality from trusted suppliers worldwide." },
              { title: "Customer-first approach", desc: "Every decision starts with the shopper." },
              { title: "Fast delivery", desc: "Reliable shipping with real-time tracking." },
              { title: "Secure shopping", desc: "Encrypted payments and protected orders." },
            ]}
          />
        </div>
      ),
    },
    {
      id: "values",
      label: "Our Values",
      icon: Gem,
      node: (
        <FeatureCards
          items={[
            { icon: ShieldCheck, title: "Trust", desc: "We earn loyalty by doing right by every customer, every time." },
            { icon: Gem, title: "Quality", desc: "Only verified, well-made products make it to our marketplace." },
            { icon: Sparkles, title: "Innovation", desc: "We constantly refine the experience with modern technology." },
            { icon: Eye, title: "Transparency", desc: "Clear pricing, honest policies, no hidden surprises." },
            { icon: HeartHandshake, title: "Customer Success", desc: "Your satisfaction is the metric that matters most." },
          ]}
        />
      ),
    },
    {
      id: "why",
      label: "Why Choose FoundOurMarket™",
      icon: BadgeCheck,
      node: (
        <FeatureCards
          items={[
            { icon: Lock, title: "Secure Checkout", desc: "Bank-grade encryption protects every transaction." },
            { icon: Truck, title: "Fast Shipping", desc: "Swift dispatch and dependable global delivery." },
            { icon: RotateCcw, title: "Easy Returns", desc: "Hassle-free returns with clear timelines." },
            { icon: Headset, title: "24/7 Support", desc: "Real help, whenever you need it." },
            { icon: BadgeCheck, title: "Verified Products", desc: "Quality-checked listings you can rely on." },
            { icon: Globe, title: "Global Marketplace", desc: "A world of products in one premium store." },
          ]}
        />
      ),
    },
    {
      id: "journey",
      label: "Our Journey",
      icon: History,
      node: (
        <Timeline
          items={[
            { year: "The Beginning", title: "Founded on a simple idea", desc: "Bring the world's best products to everyone through a premium, trustworthy storefront." },
            { year: "Today", title: "A growing global marketplace", desc: "Thousands of curated products across dozens of categories, served worldwide." },
            { year: "Next", title: "Marketplace expansion", desc: "More regions, more sellers and faster fulfilment across the globe." },
            { year: "Future", title: "More categories & better experiences", desc: "Deeper personalization and an even smoother customer journey." },
          ]}
        />
      ),
    },
    {
      id: "trust",
      label: "Built on Trust",
      icon: ShieldHalf,
      node: (
        <FeatureCards
          items={[
            { icon: ShieldCheck, title: "Customer Protection", desc: "Buyer safeguards on every order." },
            { icon: CreditCard, title: "Encrypted Payments", desc: "Your payment data is always protected." },
            { icon: PackageSearch, title: "Order Tracking", desc: "Follow your package every step of the way." },
            { icon: Wallet, title: "Refund Protection", desc: "Fair, fast refunds when things go wrong." },
          ]}
        />
      ),
    },
  ];

  return (
    <DocPage
      eyebrow="About Us"
      title={<>FoundOurMarket<span className="text-accent">™</span></>}
      subtitle="Everything You Need — All in One Place 🌍"
      description="FoundOurMarket™ is a global ecommerce marketplace dedicated to bringing high-quality products from around the world directly to customers through a premium shopping experience."
      badges={[
        { icon: Globe, label: "Worldwide Shipping" },
        { icon: ShieldCheck, label: "Secure & Verified" },
        { icon: Headset, label: "24/7 Support" },
      ]}
      sections={[
        {
          id: "overview",
          label: "Global Reach",
          icon: Globe,
          node: (
            <StatGrid
              stats={[
                { value: "50+", label: "Countries Served" },
                { value: "30+", label: "Product Categories" },
                { value: "100K+", label: "Happy Customers" },
                { value: "98%", label: "Satisfaction Rate" },
              ]}
            />
          ),
        },
        ...sections,
      ]}
      ctas={[
        { to: "/", label: "Start Shopping", primary: true },
        { to: "/search", label: "Explore Marketplace" },
      ]}
    />
  );
}
