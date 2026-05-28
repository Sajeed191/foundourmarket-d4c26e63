import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { toast } from "sonner";
import {
  Store, ArrowLeft, ShieldCheck, Sparkles, ArrowRight, CheckCircle2, Loader2,
  Rocket, Package, ClipboardList, Wallet, BadgeCheck, KeyRound, Palette, Truck,
  FileText, Crown, MessageCircle, Mail, CalendarClock, Ticket, Phone, Users,
  Paperclip, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/help/seller-assistance")({
  head: () => ({
    meta: [
      { title: "Seller Assistance — FoundOurMarket™" },
      { name: "description", content: "Expert help with selling, onboarding, payouts, orders, verification, and marketplace management on FoundOurMarket™." },
      { property: "og:title", content: "Seller Assistance — FoundOurMarket™" },
      { property: "og:description", content: "Premium seller support: onboarding, listings, payouts, compliance, and priority assistance." },
    ],
  }),
  component: SellerAssistancePage,
});

const SUPPORT_TOPICS = [
  { icon: Rocket, title: "Seller Onboarding", desc: "Launch your store with a guided setup.", tone: "from-orange-500/25 to-amber-500/10" },
  { icon: Package, title: "Product Listing Help", desc: "Optimize titles, images, and SEO.", tone: "from-amber-500/25 to-rose-500/10" },
  { icon: ClipboardList, title: "Order Management", desc: "Process, fulfill, and resolve orders.", tone: "from-sky-500/20 to-indigo-500/10" },
  { icon: Wallet, title: "Payout & Earnings", desc: "Track balances, schedules, and transfers.", tone: "from-emerald-500/20 to-teal-500/10" },
  { icon: BadgeCheck, title: "Verification & Compliance", desc: "KYC, tax forms, and policy reviews.", tone: "from-violet-500/20 to-fuchsia-500/10" },
  { icon: KeyRound, title: "Account Recovery", desc: "Secure access and credential resets.", tone: "from-red-500/20 to-orange-500/10" },
  { icon: Palette, title: "Store Customization", desc: "Branding, banners, and storefront design.", tone: "from-pink-500/20 to-rose-500/10" },
  { icon: Truck, title: "Shipping Assistance", desc: "Carriers, labels, and delivery support.", tone: "from-cyan-500/20 to-blue-500/10" },
  { icon: FileText, title: "Seller Policy Support", desc: "Marketplace guidelines and best practices.", tone: "from-slate-500/20 to-zinc-500/10" },
  { icon: Crown, title: "Priority Marketplace Support", desc: "Dedicated assistance for top sellers.", tone: "from-yellow-500/25 to-orange-500/10" },
];

const CONTACT_METHODS = [
  { icon: MessageCircle, title: "Live Chat", desc: "AI + human agents", status: "Online", color: "#22c55e", href: "/help#assistant" },
  { icon: Mail, title: "Email Seller Support", desc: "foundourmarket@gmail.com", status: "< 24h", color: "#FF7A00", href: "mailto:foundourmarket@gmail.com" },
  { icon: CalendarClock, title: "Schedule Assistance", desc: "Book a 1:1 call", status: "Free", color: "#FF9F43", href: "mailto:foundourmarket@gmail.com?subject=Schedule%20Assistance" },
  { icon: Ticket, title: "Submit Ticket", desc: "Track via your account", status: "Tracked", color: "#a78bfa", href: "#seller-form" },
  { icon: Phone, title: "WhatsApp Support", desc: "Chat with our team", status: "Active", color: "#25D366", href: "https://wa.me/" },
  { icon: Users, title: "Seller Success Team", desc: "Growth & strategy partners", status: "Verified", color: "#38bdf8", href: "mailto:foundourmarket@gmail.com?subject=Seller%20Success" },
];

const formSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(100),
  storeName: z.string().trim().min(1, "Enter your store name").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  category: z.string().min(1, "Select a category"),
  priority: z.string().min(1, "Select a priority"),
  message: z.string().trim().min(10, "Add a bit more detail").max(2000),
});

function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-32 -left-24 size-[520px] rounded-full bg-orange-500/15 blur-[140px]" />
      <div className="absolute top-1/3 -right-32 size-[460px] rounded-full bg-amber-500/10 blur-[140px]" />
      <div className="absolute bottom-0 left-1/3 size-[420px] rounded-full bg-rose-500/10 blur-[140px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(255,122,0,0.18),transparent_60%)]" />
    </div>
  );
}

function SellerAssistancePage() {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    storeName: "",
    email: user?.email ?? "",
    category: "",
    priority: "",
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setErrors({});
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1100));
    setSubmitting(false);
    setSubmitted(true);
    toast.success("Ticket received — our seller team will reply within 24h");
  };

  return (
    <div className="relative min-h-screen text-white" style={{ backgroundColor: "#050816" }}>
      <Atmosphere />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24">
        {/* Back */}
        <Link
          to="/help"
          className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white transition"
        >
          <ArrowLeft className="size-3.5" /> Back to Help Center
        </Link>

        {/* HERO */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative mt-6 rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-8 sm:p-12 overflow-hidden"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/60 to-transparent" />
          <div className="absolute -top-20 -right-20 size-[320px] rounded-full bg-orange-500/20 blur-[100px]" />

          <div className="relative flex flex-col items-start gap-5 max-w-2xl">
            <motion.div
              animate={{ scale: [1, 1.08, 1], rotate: [0, 4, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
              className="relative grid place-items-center size-14 rounded-2xl border border-orange-400/40 bg-gradient-to-br from-orange-500/30 to-amber-500/10 shadow-[0_0_40px_-8px_rgba(255,122,0,0.7)]"
            >
              <Store className="size-6 text-orange-200" />
              <span className="absolute inset-0 rounded-2xl ring-1 ring-orange-300/40 animate-ping" />
            </motion.div>

            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-orange-300">FoundOurMarket™ · Sellers</p>
              <h1 className="mt-2 font-display text-3xl sm:text-5xl font-semibold tracking-tight">
                Seller Assistance
              </h1>
              <p className="mt-3 text-sm sm:text-base text-white/70 leading-relaxed">
                Get expert help with selling, onboarding, payouts, orders, and marketplace management — backed by a dedicated team built to help your store grow.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <ShieldCheck className="size-3.5 text-emerald-400" /> Verified Support
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <Lock className="size-3.5 text-orange-300" /> Secure & Encrypted
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <Sparkles className="size-3.5 text-amber-300" /> Priority for Top Sellers
              </span>
            </div>

            <div className="flex flex-wrap gap-3 mt-2">
              <a
                href="#seller-form"
                className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white shadow-[0_10px_30px_rgba(255,122,0,0.35)] transition hover:brightness-110"
                style={{ backgroundImage: "linear-gradient(135deg,#FF7A00,#FF9F43)" }}
              >
                Open a Support Ticket
                <ArrowRight className="size-4 group-hover:translate-x-0.5 transition" />
              </a>
              <a
                href="mailto:foundourmarket@gmail.com"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] transition"
              >
                <Mail className="size-4" /> Email Seller Support
              </a>
            </div>
          </div>
        </motion.section>

        {/* SUPPORT TOPICS */}
        <section className="mt-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-orange-300">Quick support</p>
              <h2 className="font-display text-xl sm:text-2xl font-semibold mt-1">How can we help your store today?</h2>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SUPPORT_TOPICS.map((t, i) => (
              <motion.a
                key={t.title}
                href="#seller-form"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.03, duration: 0.4 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => update("category")(t.title)}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 overflow-hidden hover:border-orange-400/40 transition"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${t.tone} opacity-0 group-hover:opacity-100 transition-opacity`} />
                <div className="relative flex items-start gap-3">
                  <div className="grid place-items-center size-10 rounded-xl bg-white/5 border border-white/10 text-orange-300 group-hover:shadow-[0_0_24px_-6px_rgba(255,122,0,0.7)] transition">
                    <t.icon className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{t.title}</p>
                    <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{t.desc}</p>
                  </div>
                  <ArrowRight className="size-4 text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition" />
                </div>
              </motion.a>
            ))}
          </div>
        </section>

        {/* CONTACT METHODS */}
        <section className="mt-12">
          <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-orange-300">Talk to us</p>
          <h2 className="font-display text-xl sm:text-2xl font-semibold mt-1">Choose your channel</h2>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CONTACT_METHODS.map((m, i) => (
              <motion.a
                key={m.title}
                href={m.href}
                target={m.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ y: -2 }}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 flex items-center gap-3 hover:border-white/20 transition overflow-hidden"
              >
                <span
                  className="absolute -left-10 -top-10 size-32 rounded-full blur-3xl opacity-0 group-hover:opacity-40 transition-opacity"
                  style={{ backgroundColor: m.color }}
                />
                <div
                  className="relative grid place-items-center size-10 rounded-xl border border-white/10"
                  style={{ backgroundColor: `${m.color}1A`, color: m.color }}
                >
                  <m.icon className="size-5" />
                </div>
                <div className="relative flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{m.title}</p>
                  <p className="text-xs text-white/60 truncate">{m.desc}</p>
                </div>
                <span className="relative text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/70">
                  {m.status}
                </span>
              </motion.a>
            ))}
          </div>
        </section>

        {/* FORM */}
        <section id="seller-form" className="mt-14 scroll-mt-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-6 sm:p-10 overflow-hidden"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/60 to-transparent" />
            <div className="absolute -bottom-24 -right-24 size-[300px] rounded-full bg-orange-500/10 blur-[100px]" />

            <div className="relative max-w-2xl">
              <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-orange-300">Seller Support</p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold mt-1">Submit a support request</h2>
              <p className="text-sm text-white/60 mt-2">
                Share a few details and our seller team will reply within 24 hours. Sensitive data is encrypted in transit.
              </p>
            </div>

            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative mt-8 rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.06] p-6 flex items-start gap-4"
              >
                <div className="grid place-items-center size-11 rounded-xl bg-emerald-500/20 text-emerald-300">
                  <CheckCircle2 className="size-6" />
                </div>
                <div>
                  <p className="font-semibold">Your request has been received</p>
                  <p className="text-sm text-white/70 mt-1">
                    Reference: <span className="font-mono text-emerald-300">FOM-{Date.now().toString(36).toUpperCase()}</span>
                  </p>
                  <p className="text-xs text-white/60 mt-2">
                    A seller specialist will respond to <span className="text-white">{form.email}</span> within 24 hours.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      className="border-white/15 bg-white/5 hover:bg-white/10 text-white"
                      onClick={() => { setSubmitted(false); setForm((f) => ({ ...f, message: "" })); }}
                    >
                      Submit another
                    </Button>
                    <Link to="/help" className="inline-flex items-center px-4 h-9 rounded-md text-sm bg-white/5 border border-white/10 hover:bg-white/10 transition">
                      Back to Help Center
                    </Link>
                  </div>
                </div>
              </motion.div>
            ) : (
              <form onSubmit={onSubmit} className="relative mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full name" error={errors.fullName}>
                  <Input
                    value={form.fullName}
                    onChange={(e) => update("fullName")(e.target.value)}
                    placeholder="Jane Doe"
                    maxLength={100}
                    className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-orange-400/40"
                  />
                </Field>
                <Field label="Store name" error={errors.storeName}>
                  <Input
                    value={form.storeName}
                    onChange={(e) => update("storeName")(e.target.value)}
                    placeholder="Atelier Lumière"
                    maxLength={100}
                    className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-orange-400/40"
                  />
                </Field>
                <Field label="Email" error={errors.email}>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email")(e.target.value)}
                    placeholder="seller@email.com"
                    maxLength={255}
                    className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-orange-400/40"
                  />
                </Field>
                <Field label="Issue category" error={errors.category}>
                  <Select value={form.category} onValueChange={update("category")}>
                    <SelectTrigger className="bg-white/[0.04] border-white/10 text-white focus:ring-orange-400/40">
                      <SelectValue placeholder="Select a topic" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_TOPICS.map((t) => (
                        <SelectItem key={t.title} value={t.title}>{t.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Priority level" error={errors.priority}>
                  <Select value={form.priority} onValueChange={update("priority")}>
                    <SelectTrigger className="bg-white/[0.04] border-white/10 text-white focus:ring-orange-400/40">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low — general question</SelectItem>
                      <SelectItem value="Normal">Normal — needs attention</SelectItem>
                      <SelectItem value="High">High — affecting my store</SelectItem>
                      <SelectItem value="Urgent">Urgent — store/payout blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Tell us what's going on" error={errors.message}>
                    <Textarea
                      value={form.message}
                      onChange={(e) => update("message")(e.target.value)}
                      placeholder="Describe the issue with as much detail as possible…"
                      maxLength={2000}
                      rows={6}
                      className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-orange-400/40 resize-none"
                    />
                  </Field>
                </div>

                <div className="sm:col-span-2">
                  <label
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-white/60 text-xs cursor-not-allowed"
                    title="Attachments coming soon"
                  >
                    <Paperclip className="size-4 text-orange-300" />
                    Attach screenshots or documents — <span className="text-white/40">coming soon</span>
                  </label>
                </div>

                <div className="sm:col-span-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4 mt-2">
                  <p className="text-[11px] text-white/40 inline-flex items-center gap-1.5">
                    <Lock className="size-3" /> Encrypted & handled by verified FoundOurMarket™ staff
                  </p>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="h-11 px-6 text-white shadow-[0_10px_30px_rgba(255,122,0,0.35)] hover:brightness-110"
                    style={{ backgroundImage: "linear-gradient(135deg,#FF7A00,#FF9F43)" }}
                  >
                    {submitting ? (
                      <><Loader2 className="size-4 animate-spin" /> Sending…</>
                    ) : (
                      <>Submit Request <ArrowRight className="size-4" /></>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </motion.div>
        </section>

        {/* FOOTER NOTE */}
        <div className="mt-10 text-center text-[11px] text-white/40">
          Can't reach the form? Email us directly at{" "}
          <a className="text-orange-300 hover:underline" href="mailto:foundourmarket@gmail.com">
            foundourmarket@gmail.com
          </a>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-white/70">{label}</Label>
      {children}
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
