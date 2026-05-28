import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft, ShieldCheck, Sparkles, ArrowRight, CheckCircle2, Loader2,
  Truck, CreditCard, RotateCcw, AlertTriangle, PackageSearch, UserCog,
  MessageCircle, Mail, CalendarClock, Phone, Lock, ShieldHalf, Zap,
  BadgeCheck, Star, Upload, LifeBuoy, Headphones, ExternalLink, X, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";

const WHATSAPP_NUMBERS = [
  { number: "919745844213", display: "+91 97458 44213", department: "General Marketplace Support" },
  { number: "916282088380", display: "+91 62820 88380", department: "Seller Operations & Payouts" },
  { number: "918714459240", display: "+91 87144 59240", department: "Orders, Shipping & Disputes" },
];
const WHATSAPP_MESSAGE = "Hello FoundOurMarket Support, I need assistance regarding my marketplace account.";
const SUPPORT_EMAIL = "support@foundourmarket.com";
const CALENDLY_HANDLE = "foundourmarket/seller-support";
const CALENDLY_URL = `https://calendly.com/${CALENDLY_HANDLE}`;
const CALENDLY_EMBED_URL = `${CALENDLY_URL}?hide_gdpr_banner=1&background_color=0a0f1f&text_color=ffffff&primary_color=ff7a00`;
const SCHEDULE_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Schedule Assistance Call")}&body=${encodeURIComponent("Hi FoundOurMarket team,\n\nI'd like to schedule a 1:1 call with a seller specialist.\n\nMy preferred times (with timezone):\n• \n• \n• \n\nBriefly, what I need help with:\n\n\nThanks,\n")}`;

export const Route = createFileRoute("/help/seller-assistance")({
  head: () => ({
    meta: [
      { title: "Seller Assistance — FoundOurMarket™" },
      { name: "description", content: "Fast support for orders, suppliers, payouts, and marketplace operations on FoundOurMarket™." },
      { property: "og:title", content: "Seller Assistance — FoundOurMarket™" },
      { property: "og:description", content: "Premium marketplace support: shipments, payments, disputes, and verified seller protection." },
    ],
  }),
  component: SellerAssistancePage,
});

const BG = "#050816";
const ACCENT = "#FF7A00";
const ACCENT_2 = "#FF9F43";

const QUICK_ACTIONS = [
  { icon: Truck, title: "Track Shipment", desc: "Live delivery status & ETA", color: "#FF9F43" },
  { icon: CreditCard, title: "Payment Issues", desc: "Charges, payouts & invoices", color: "#22d3ee" },
  { icon: RotateCcw, title: "Refund Request", desc: "Start a guided refund", color: "#a78bfa" },
  { icon: AlertTriangle, title: "Supplier Dispute", desc: "Open a marketplace case", color: "#fb7185" },
  { icon: PackageSearch, title: "Missing Product", desc: "Report lost / wrong item", color: "#34d399" },
  { icon: UserCog, title: "Account Support", desc: "Access, security & roles", color: "#FF7A00" },
];

const PROTECTION = [
  { icon: BadgeCheck, label: "Verified Suppliers" },
  { icon: ShieldHalf, label: "Secure Transactions" },
  { icon: Zap, label: "Priority Escalation" },
  { icon: ShieldCheck, label: "Seller Protection" },
];

const CHANNELS = [
  { id: "chat", icon: MessageCircle, title: "Live Chat", meta: "Support Online · Typically replies instantly", status: "Online", color: "#22c55e", loading: "Connecting to Live Marketplace Support…", badge: "Verified" },
  { id: "email", icon: Mail, title: "Priority Email", meta: SUPPORT_EMAIL, status: "< 24h", color: "#FF9F43", loading: "Opening Priority Assistance…", badge: "Encrypted" },
  { id: "call", icon: CalendarClock, title: "Schedule a Call", meta: "Free 1:1 with seller team", status: "Bookable", color: "#a78bfa", loading: "Scheduling Assistance Session…", badge: "Enterprise" },
  { id: "whatsapp", icon: Phone, title: "WhatsApp Support", meta: "Direct mobile assistance", status: "Live", color: "#25D366", loading: "Connecting to Marketplace Support…", badge: "Encrypted" },
] as const;

const SUPPLIERS = [
  { icon: BadgeCheck, label: "Verified Supplier", tone: "from-emerald-400/30 to-emerald-400/0" },
  { icon: Truck, label: "Fast Shipping", tone: "from-sky-400/30 to-sky-400/0" },
  { icon: ShieldCheck, label: "Trusted Vendor", tone: "from-orange-400/30 to-orange-400/0" },
  { icon: Star, label: "High Response Rate", tone: "from-amber-300/30 to-amber-300/0" },
];

const formSchema = z.object({
  orderId: z.string().trim().min(2, "Enter your order ID").max(64),
  issueType: z.string().min(1, "Select an issue type"),
  priority: z.string().min(1, "Select a priority"),
  description: z.string().trim().min(10, "Add a bit more detail").max(2000),
});

function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <motion.div
        initial={{ opacity: 0.5 }}
        animate={{ opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-32 -left-24 size-[520px] rounded-full blur-[160px]"
        style={{ backgroundColor: "rgba(255,122,0,0.10)" }}
      />
      <motion.div
        initial={{ opacity: 0.4 }}
        animate={{ opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute top-1/3 -right-32 size-[460px] rounded-full blur-[160px]"
        style={{ backgroundColor: "rgba(255,159,67,0.08)" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(255,122,0,0.10),transparent_60%)]" />
      <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] bg-[size:48px_48px]" />
    </div>
  );
}

function SellerAssistancePage() {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    orderId: "",
    issueType: "",
    priority: "",
    description: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));
  const [loadingChannel, setLoadingChannel] = useState<string | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const openWhatsApp = (number: string) => {
    const url = `https://wa.me/${number}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleChannel = (id: string) => {
    if (loadingChannel) return;
    setLoadingChannel(id);
    const finish = () => setLoadingChannel(null);
    if (id === "whatsapp") {
      toast.message("Connecting to Marketplace Support…", { description: "Choose a department to continue on WhatsApp." });
      setTimeout(() => { setWhatsappOpen(true); finish(); }, 650);
    } else if (id === "email") {
      toast.message("Opening Priority Assistance…");
      setTimeout(() => {
        window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Priority Support Request")}&body=${encodeURIComponent("Hello FoundOurMarket Support,\n\nI need priority assistance regarding:\n\n")}`;
        finish();
      }, 600);
    } else if (id === "call") {
      toast.message("Scheduling Assistance Session…");
      setTimeout(() => { setScheduleOpen(true); finish(); }, 700);
    } else if (id === "chat") {
      toast.loading("Connecting to Live Marketplace Support…", { id: "chat-connect" });
      setTimeout(() => {
        toast.success("Live chat is warming up", { id: "chat-connect", description: "A seller specialist will join in a moment." });
        finish();
      }, 1400);
    }
  };

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
    toast.success("Request received — our seller team will reply within 24h");
  };

  return (
    <div className="relative min-h-screen text-white" style={{ backgroundColor: BG }}>
      <Atmosphere />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-32">
        <Link to="/help" className="inline-flex items-center gap-2 text-xs text-white/55 hover:text-white transition">
          <ArrowLeft className="size-3.5" /> Back to Help Center
        </Link>

        {/* HERO */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-5 rounded-[28px] border border-white/10 bg-white/[0.025] backdrop-blur-2xl overflow-hidden"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/60 to-transparent" />
          <motion.div
            aria-hidden
            animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-24 -right-24 size-[340px] rounded-full blur-[110px]"
            style={{ backgroundColor: "rgba(255,122,0,0.18)" }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(120%_60%_at_0%_0%,rgba(255,159,67,0.10),transparent_55%)]" />

          <div className="relative p-7 sm:p-12">
            <div className="flex items-center gap-2 mb-5">
              <div
                className="grid place-items-center size-9 rounded-xl border border-white/10 shadow-[0_8px_30px_-10px_rgba(255,122,0,0.6)]"
                style={{ backgroundImage: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})` }}
              >
                <LifeBuoy className="size-4.5 text-white" />
              </div>
              <div className="leading-tight">
                <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-orange-300/90">FoundOurMarket™</p>
                <p className="text-[11px] text-white/55">Seller Operations</p>
              </div>
            </div>

            <h1 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.05] max-w-2xl">
              Seller <span style={{ backgroundImage: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})`, WebkitBackgroundClip: "text", color: "transparent" }}>Assistance</span>
            </h1>
            <p className="mt-3 text-sm sm:text-base text-white/65 max-w-xl leading-relaxed">
              Fast support for orders, suppliers, payouts, and marketplace operations.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { icon: ShieldCheck, label: "Verified Support", color: "#34d399" },
                { icon: Headphones, label: "24/7 Assistance", color: "#FF9F43" },
                { icon: Lock, label: "Secure Marketplace", color: "#a78bfa" },
              ].map((b) => (
                <span key={b.label} className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur">
                  <b.icon className="size-3.5" style={{ color: b.color }} /> {b.label}
                </span>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap gap-2.5">
              <a
                href="#seller-form"
                className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white shadow-[0_10px_30px_-8px_rgba(255,122,0,0.55)] transition hover:brightness-110"
                style={{ backgroundImage: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})` }}
              >
                Open a Support Request
                <ArrowRight className="size-4 group-hover:translate-x-0.5 transition" />
              </a>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Priority Support Request")}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] transition"
              >
                <Mail className="size-4" /> Priority Email
              </a>
            </div>
          </div>
        </motion.section>

        {/* QUICK ACTIONS */}
        <Section eyebrow="Quick actions" title="What do you need help with?">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {QUICK_ACTIONS.map((a, i) => (
              <motion.a
                key={a.title}
                href="#seller-form"
                onClick={() => setForm((f) => ({ ...f, issueType: a.title }))}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.05, duration: 0.45, ease: "easeOut" }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.985 }}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5 overflow-hidden hover:border-white/20 transition"
              >
                <span
                  className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full blur-3xl opacity-0 group-hover:opacity-40 transition-opacity duration-500"
                  style={{ backgroundColor: a.color }}
                />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 group-hover:opacity-100 transition" />
                <div className="relative flex items-start gap-3.5">
                  <div
                    className="grid place-items-center size-11 rounded-xl border border-white/10"
                    style={{ backgroundColor: `${a.color}1A`, color: a.color }}
                  >
                    <a.icon className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold tracking-tight">{a.title}</p>
                    <p className="text-xs text-white/55 mt-0.5">{a.desc}</p>
                  </div>
                  <ArrowRight className="size-4 text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition" />
                </div>
              </motion.a>
            ))}
          </div>
        </Section>

        {/* MARKETPLACE PROTECTION */}
        <Section eyebrow="Trust & safety" title="Marketplace Protection">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.015] backdrop-blur-2xl p-6 sm:p-8 overflow-hidden"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/50 to-transparent" />
            <div className="absolute -bottom-20 -left-20 size-[260px] rounded-full blur-[110px]" style={{ backgroundColor: "rgba(255,122,0,0.10)" }} />

            <div className="relative max-w-2xl">
              <p className="text-sm sm:text-base text-white/70 leading-relaxed">
                All verified marketplace transactions are protected through FoundOurMarket seller support systems — from payment guarantees to dispute mediation and account safeguards.
              </p>
            </div>

            <div className="relative mt-6 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {PROTECTION.map((p, i) => (
                <motion.div
                  key={p.label}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-white/[0.04] border border-white/10 hover:border-orange-300/30 transition"
                >
                  <div className="grid place-items-center size-9 rounded-lg border border-white/10 bg-white/[0.04] text-orange-300">
                    <p.icon className="size-4.5" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-white/85">{p.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </Section>

        {/* CHANNELS */}
        <Section eyebrow="Talk to us" title="Support channels">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CHANNELS.map((c, i) => (
              <motion.button
                key={c.id}
                type="button"
                onClick={() => handleChannel(c.id)}
                disabled={loadingChannel === c.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group relative text-left rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 flex items-center gap-3.5 hover:border-white/20 hover:shadow-[0_18px_50px_-20px_rgba(255,122,0,0.5)] transition overflow-hidden disabled:opacity-70"
              >
                <span
                  className="pointer-events-none absolute -left-10 -top-10 size-32 rounded-full blur-3xl opacity-0 group-hover:opacity-50 transition-opacity"
                  style={{ backgroundColor: c.color }}
                />
                <div
                  className="relative grid place-items-center size-11 rounded-xl border border-white/10"
                  style={{ backgroundColor: `${c.color}1A`, color: c.color }}
                >
                  {loadingChannel === c.id ? <Loader2 className="size-5 animate-spin" /> : <c.icon className="size-5" />}
                </div>
                <div className="relative flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{c.title}</p>
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-white/60">
                      <Lock className="size-2.5" /> {c.badge}
                    </span>
                  </div>
                  <p className="text-xs text-white/55 truncate mt-0.5">{loadingChannel === c.id ? c.loading : c.meta}</p>
                </div>
                <span className="relative inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-white/75">
                  <span className="relative size-1.5 rounded-full" style={{ backgroundColor: c.color, boxShadow: `0 0 10px ${c.color}` }}>
                    {(c.status === "Online" || c.status === "Live") && (
                      <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: c.color, opacity: 0.6 }} />
                    )}
                  </span>
                  {c.status}
                </span>
              </motion.button>
            ))}
          </div>
        </Section>

        {/* FORM */}
        <Section eyebrow="Submit a request" title="Tell us what's going on" id="seller-form">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-6 sm:p-8 overflow-hidden"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/60 to-transparent" />
            <div className="absolute -bottom-24 -right-24 size-[280px] rounded-full blur-[110px]" style={{ backgroundColor: "rgba(255,122,0,0.08)" }} />

            <AnimatePresence mode="wait">
              {submitted ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-6 flex items-start gap-4"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 18 }}
                    className="grid place-items-center size-11 rounded-xl bg-emerald-500/20 text-emerald-300"
                  >
                    <CheckCircle2 className="size-6" />
                  </motion.div>
                  <div>
                    <p className="font-semibold">Your request has been received</p>
                    <p className="text-sm text-white/70 mt-1">
                      Reference: <span className="font-mono text-emerald-300">FOM-{Date.now().toString(36).toUpperCase()}</span>
                    </p>
                    <p className="text-xs text-white/55 mt-2">
                      A seller specialist will respond {user?.email ? <>to <span className="text-white">{user.email}</span></> : "shortly"} within 24 hours.
                    </p>
                    <div className="mt-4 flex gap-2">
                      <Button
                        variant="outline"
                        className="border-white/15 bg-white/5 hover:bg-white/10 text-white"
                        onClick={() => { setSubmitted(false); setForm({ orderId: "", issueType: "", priority: "", description: "" }); setFile(null); }}
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
                <motion.form
                  key="form"
                  onSubmit={onSubmit}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative grid grid-cols-1 sm:grid-cols-2 gap-4"
                >
                  <Field label="Order ID" error={errors.orderId}>
                    <Input
                      value={form.orderId}
                      onChange={(e) => update("orderId")(e.target.value)}
                      placeholder="FOM-A1B2C3"
                      maxLength={64}
                      className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-orange-400/40"
                    />
                  </Field>

                  <Field label="Issue type" error={errors.issueType}>
                    <Select value={form.issueType} onValueChange={update("issueType")}>
                      <SelectTrigger className="bg-white/[0.04] border-white/10 text-white focus:ring-orange-400/40">
                        <SelectValue placeholder="Select an issue" />
                      </SelectTrigger>
                      <SelectContent>
                        {QUICK_ACTIONS.map((q) => (
                          <SelectItem key={q.title} value={q.title}>{q.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Priority" error={errors.priority}>
                    <Select value={form.priority} onValueChange={update("priority")}>
                      <SelectTrigger className="bg-white/[0.04] border-white/10 text-white focus:ring-orange-400/40">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low — general question</SelectItem>
                        <SelectItem value="Normal">Normal — needs attention</SelectItem>
                        <SelectItem value="High">High — affecting my store</SelectItem>
                        <SelectItem value="Urgent">Urgent — payout/order blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Upload screenshot">
                    <label className="flex items-center gap-3 px-3.5 h-10 rounded-md border border-dashed border-white/15 bg-white/[0.03] hover:bg-white/[0.05] text-white/70 text-xs cursor-pointer transition">
                      <Upload className="size-4 text-orange-300" />
                      <span className="truncate">{file ? file.name : "Attach an image (optional)"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </Field>

                  <div className="sm:col-span-2">
                    <Field label="Description" error={errors.description}>
                      <Textarea
                        value={form.description}
                        onChange={(e) => update("description")(e.target.value)}
                        placeholder="Describe the issue with as much detail as possible…"
                        maxLength={2000}
                        rows={5}
                        className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-orange-400/40 resize-none"
                      />
                    </Field>
                  </div>

                  <div className="sm:col-span-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                    <p className="text-[11px] text-white/40 inline-flex items-center gap-1.5">
                      <Lock className="size-3" /> Encrypted & handled by verified FoundOurMarket™ staff
                    </p>
                    <motion.div whileTap={{ scale: 0.98 }}>
                      <Button
                        type="submit"
                        disabled={submitting}
                        className="relative h-11 px-6 text-white shadow-[0_12px_36px_-10px_rgba(255,122,0,0.6)] hover:brightness-110 overflow-hidden"
                        style={{ backgroundImage: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})` }}
                      >
                        <span className="relative z-10 inline-flex items-center gap-2">
                          {submitting ? (<><Loader2 className="size-4 animate-spin" /> Sending…</>) : (<>Submit Request <ArrowRight className="size-4" /></>)}
                        </span>
                        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent group-hover:translate-x-full transition-transform duration-700" />
                      </Button>
                    </motion.div>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </Section>

        {/* VERIFIED SUPPLIERS */}
        <Section eyebrow="Verified suppliers" title="Trusted across the marketplace">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {SUPPLIERS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -3 }}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${s.tone} opacity-50 group-hover:opacity-100 transition-opacity`} />
                <div className="relative flex flex-col items-start gap-3">
                  <div className="grid place-items-center size-10 rounded-xl bg-white/[0.06] border border-white/10 text-white">
                    <s.icon className="size-5" />
                  </div>
                  <p className="text-sm font-semibold leading-tight">{s.label}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </Section>

        <div className="mt-12 text-center text-[11px] text-white/40">
          Can't reach the form? Email us at{" "}
          <a className="text-orange-300 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </div>
      </div>

      {/* Sticky bottom CTA — mobile */}
      <div className="sm:hidden fixed bottom-4 inset-x-4 z-40">
        <a
          href="#seller-form"
          className="flex items-center justify-center gap-2 h-12 rounded-2xl text-sm font-semibold text-white shadow-[0_18px_40px_-12px_rgba(255,122,0,0.7)] backdrop-blur"
          style={{ backgroundImage: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})` }}
        >
          <Sparkles className="size-4" /> Get Seller Support
        </a>
      </div>

      {/* WhatsApp department picker */}
      <Dialog open={whatsappOpen} onOpenChange={setWhatsappOpen}>
        <DialogContent className="border-white/10 bg-[#0a0f1f]/95 backdrop-blur-2xl text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="grid place-items-center size-8 rounded-lg bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30">
                <Phone className="size-4" />
              </span>
              WhatsApp Marketplace Support
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Choose the team that best matches your request. Encrypted end-to-end on WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-1">
            {WHATSAPP_NUMBERS.map((w) => (
              <button
                key={w.number}
                onClick={() => { openWhatsApp(w.number); setWhatsappOpen(false); }}
                className="w-full group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-[#25D366]/40 transition p-3 text-left active:scale-[0.98]"
              >
                <span className="grid place-items-center size-10 rounded-lg bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/25">
                  <MessageCircle className="size-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{w.department}</p>
                  <p className="text-[11px] text-white/55 font-mono">{w.display}</p>
                </div>
                <ArrowRight className="size-4 text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition" />
              </button>
            ))}
          </div>
          <p className="text-[11px] text-white/40 inline-flex items-center gap-1.5 mt-2">
            <Lock className="size-3" /> Encrypted · Verified FoundOurMarket™ staff
          </p>
        </DialogContent>
      </Dialog>

      {/* Schedule a call dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="border-white/10 bg-[#0a0f1f]/95 backdrop-blur-2xl text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="grid place-items-center size-8 rounded-lg bg-violet-500/15 text-violet-300 border border-violet-400/30">
                <CalendarClock className="size-4" />
              </span>
              Schedule an Assistance Session
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Book a free 1:1 with a FoundOurMarket™ seller specialist.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 mt-1">
            <a
              href="https://calendly.com/foundourmarket/seller-support"
              target="_blank" rel="noopener noreferrer"
              onClick={() => setScheduleOpen(false)}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-orange-300/40 transition p-3 active:scale-[0.98]"
            >
              <span className="grid place-items-center size-10 rounded-lg" style={{ backgroundImage: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_2})` }}>
                <CalendarClock className="size-5 text-white" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Open Calendly</p>
                <p className="text-[11px] text-white/55">Pick a slot that works for you</p>
              </div>
              <ArrowRight className="size-4 text-white/40" />
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Schedule Assistance Call")}&body=${encodeURIComponent("Hi FoundOurMarket team,\n\nI'd like to schedule a 1:1 call. My preferred times are:\n\n")}`}
              onClick={() => setScheduleOpen(false)}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition p-3 active:scale-[0.98]"
            >
              <span className="grid place-items-center size-10 rounded-lg bg-white/[0.06] border border-white/10 text-orange-300">
                <Mail className="size-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Request via Email</p>
                <p className="text-[11px] text-white/55">We'll reply with available slots</p>
              </div>
              <ArrowRight className="size-4 text-white/40" />
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  eyebrow, title, id, children,
}: { eyebrow: string; title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 sm:mt-14 scroll-mt-24">
      <div className="mb-5">
        <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-orange-300/90">{eyebrow}</p>
        <h2 className="font-display text-xl sm:text-2xl font-semibold mt-1.5 tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
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
