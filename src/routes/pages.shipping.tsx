import { createFileRoute, Link } from "@tanstack/react-router";
import { PolicyCrossLinks } from "@/components/site/PolicyLinks";
import { motion } from "framer-motion";
import {
  Truck,
  PackageCheck,
  Clock,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  ChevronRight,
  Globe,
} from "lucide-react";

export const Route = createFileRoute("/pages/shipping")({
  head: () => ({
    meta: [
      { title: "Shipping & Returns Policy — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Learn about FoundOurMarket's Standard delivery windows, shipping coverage, return eligibility, and refund timelines.",
      },
      {
        property: "og:title",
        content: "Shipping & Returns Policy — FoundOurMarket™",
      },
      {
        property: "og:description",
        content:
          "Standard delivery windows, shipping coverage, return eligibility, and refund timelines.",
      },
    ],
  }),
  component: ShippingReturnsPage,
});

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const DELIVERY_WINDOWS = [
  {
    region: "United States & Canada",
    standard: "4–7 business days",
    note: "Orders placed before 2:00 PM ET are dispatched within 1 business day. Weekends & holidays excluded.",
  },
  {
    region: "United Kingdom & EU",
    standard: "5–9 business days",
    note: "Customs clearance may add 1–3 days. Duties included at checkout where applicable.",
  },
  {
    region: "Asia-Pacific",
    standard: "6–10 business days",
    note: "Major metros tend toward the lower end. Remote areas may extend to 12 days.",
  },
  {
    region: "India",
    standard: "3–6 business days",
    note: "Metro cities average 3–4 days. Tier-2/3 cities may take up to 6 days.",
  },
  {
    region: "Rest of World",
    standard: "8–14 business days",
    note: "International lanes with limited direct routing may experience longer transit.",
  },
];

const RETURNS_POLICY = [
  {
    icon: Clock,
    title: "4-Day Return Window",
    body: "Eligible items may be returned within 4 calendar days of delivery. The window opens the day the carrier marks the package as delivered.",
  },
  {
    icon: PackageCheck,
    title: "Condition Requirements",
    body: "Items must be unused, in original packaging, with all tags and accessories intact. We reserve the right to refuse returns that show wear, damage, or tampering.",
  },
  {
    icon: RotateCcw,
    title: "Refund Timeline",
    body: "Once your return is received and inspected, refunds are issued to the original payment method within 5–10 business days. You will receive email confirmation at each stage.",
  },
  {
    icon: AlertTriangle,
    title: "Non-Returnable Items",
    body: "Intimates, swimwear, perishables, personalized goods, and digital products are final sale. Seller-specific exclusions are noted on the product page.",
  },
];

/* ------------------------------------------------------------------ */
/*  Components                                                         */
/* ------------------------------------------------------------------ */

function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 size-[640px] rounded-full blur-3xl opacity-30"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,122,0,0.30), transparent 70%)",
        }}
      />
      <div
        className="absolute top-1/3 -right-20 size-[420px] rounded-full blur-3xl opacity-20"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,159,67,0.20), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-xl text-[10px] font-mono uppercase tracking-[0.3em] text-white/70">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function ShippingReturnsPage() {
  return (
    <div className="relative min-h-screen text-white" style={{ backgroundColor: "#050816" }}>
      <Atmosphere />

      <div className="relative container-page py-10 sm:py-16 max-w-5xl">
        {/* ── HERO ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12 sm:mb-16"
        >
          <Eyebrow>
            <Truck className="size-3.5 text-orange-300" />
            Policy
          </Eyebrow>
          <h1 className="mt-4 text-fluid-3xl font-display font-semibold tracking-tight">
            Shipping &{" "}
            <span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">
              Returns
            </span>
          </h1>
          <p className="mt-4 text-sm sm:text-base text-white/60 max-w-2xl mx-auto leading-relaxed">
            Transparent delivery timelines, honest coverage details, and a straightforward
            return process. No surprises — just clarity.
          </p>
        </motion.div>

        {/* ── DELIVERY METHOD BANNER ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-10 sm:mb-14 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden"
        >
          <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 grid place-items-center shadow-lg shadow-orange-500/20">
              <ShieldCheck className="size-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-display font-semibold text-lg leading-tight">
                Standard Delivery Only
              </h3>
              <p className="mt-1.5 text-sm text-white/60 leading-relaxed">
                FoundOurMarket does <strong className="text-white/90">not</strong> offer express,
                overnight, or same-day delivery at this time. Every order ships via our vetted
                Standard network. Free delivery is available only on eligible products and
                promotional offers. Shipping availability and charges are displayed on each
                product page before checkout.
              </p>
            </div>
          </div>
          <div className="px-6 sm:px-8 pb-6 sm:pb-8 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-white/70">
              <Globe className="size-3 text-orange-300" />
              Global Coverage
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-white/70">
              <Clock className="size-3 text-orange-300" />
              Business Days Only
            </span>
          </div>
        </motion.div>

        {/* ── STANDARD DELIVERY WINDOWS ── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-12 sm:mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-orange-300">
              Delivery Windows
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="grid gap-4">
            {DELIVERY_WINDOWS.map((row, i) => (
              <motion.div
                key={row.region}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25 + i * 0.06 }}
                className="group rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 p-5 sm:p-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                  <div className="flex-1">
                    <h4 className="font-display font-medium text-sm sm:text-base">
                      {row.region}
                    </h4>
                    <p className="mt-1 text-xs sm:text-sm text-white/50 leading-relaxed">
                      {row.note}
                    </p>
                  </div>
                  <div className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20">
                    <Clock className="size-3.5 text-orange-300" />
                    <span className="text-xs font-mono text-orange-200">{row.standard}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ── RETURNS POLICY ── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mb-12 sm:mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-orange-300">
              Returns
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {RETURNS_POLICY.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 + i * 0.08 }}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6 hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 mt-0.5 w-9 h-9 rounded-lg bg-white/[0.05] border border-white/10 grid place-items-center">
                    <item.icon className="size-4 text-orange-300" />
                  </div>
                  <div>
                    <h4 className="font-display font-medium text-sm">{item.title}</h4>
                    <p className="mt-1.5 text-xs sm:text-sm text-white/50 leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ── SUMMARY CTA ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 sm:p-8 text-center"
        >
          <h3 className="font-display font-semibold text-xl sm:text-2xl">
            Need help with an order?
          </h3>
          <p className="mt-2 text-sm text-white/50 max-w-lg mx-auto">
            Track shipments, start a return, or reach out to our support team — we are here to
            help.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/track"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-xs font-medium uppercase tracking-widest text-accent-foreground transition hover:brightness-110"
            >
              Track Order
              <ChevronRight className="size-3.5" />
            </Link>
            <Link
              to="/returns"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-xs font-medium uppercase tracking-widest text-white/80 transition hover:bg-white/[0.05] hover:text-white"
            >
              Start a Return
            </Link>
          </div>
        </motion.div>

        <div className="mt-12">
          <PolicyCrossLinks
            title="Related policies"
            keys={["refund", "return", "contact"]}
            variant="dark"
          />
        </div>
      </div>
    </div>
  );
}
