import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode, type ComponentType } from "react";
import { ArrowRight, type LucideProps } from "lucide-react";

export type DocSection = {
  id: string;
  label: string;
  icon: ComponentType<LucideProps>;
  node: ReactNode;
};

export type DocCta = { to: string; params?: Record<string, string>; label: string; primary?: boolean };

/* ---------- Reading progress bar ---------- */
function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(100, (h.scrollTop / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return progress;
}

/* ---------- Section reveal on scroll ---------- */
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(22px)",
        transition: `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ---------- Active section tracking for the TOC ---------- */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [ids.join("|")]);
  return active;
}

export function DocPage({
  eyebrow,
  title,
  subtitle,
  description,
  badges,
  sections,
  ctas,
  related,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle: string;
  description?: string;
  badges?: { icon: ComponentType<LucideProps>; label: string }[];
  sections: DocSection[];
  ctas?: DocCta[];
  related?: ReactNode;
}) {
  const progress = useScrollProgress();
  const active = useActiveSection(sections.map((s) => s.id));

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <div className="relative">
      {/* Reading progress bar */}
      <div className="fixed left-0 top-0 z-[55] h-[3px] w-full bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-accent/40 via-accent to-accent/40 shadow-[0_0_12px_var(--color-accent)] transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Ambient background glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 opacity-70 blur-3xl" style={{ background: "var(--gradient-ember)" }} />
        <div className="absolute top-1/3 -right-40 h-[360px] w-[360px] opacity-40 blur-3xl" style={{ background: "var(--gradient-ember-soft)" }} />
      </div>

      {/* Hero */}
      <header className="relative px-[max(1.25rem,var(--mobile-safe-left))] pt-16 sm:pt-24 pb-10 sm:pb-14">
        <div className="mx-auto max-w-[720px] text-center">
          {eyebrow && (
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-accent">
                <span className="size-1.5 rounded-full bg-accent animate-glow" /> {eyebrow}
              </span>
            </Reveal>
          )}
          <Reveal delay={60}>
            <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-display font-semibold tracking-tight leading-[1.05]">
              {title}
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-4 text-base sm:text-lg text-gradient-ember font-display font-medium">{subtitle}</p>
          </Reveal>
          {description && (
            <Reveal delay={180}>
              <p className="mx-auto mt-5 max-w-[640px] text-sm sm:text-base leading-relaxed text-muted-foreground">{description}</p>
            </Reveal>
          )}
          {badges && badges.length > 0 && (
            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
                {badges.map((b) => (
                  <span key={b.label} className="glass inline-flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-2 text-[11px] font-medium text-foreground/90">
                    <b.icon className="size-3.5 text-accent" /> {b.label}
                  </span>
                ))}
              </div>
            </Reveal>
          )}
        </div>
      </header>

      {/* Body: sticky TOC + content */}
      <div className="relative mx-auto max-w-6xl px-[max(1.25rem,var(--mobile-safe-left))] pb-24">
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
          {/* Sticky TOC (desktop) */}
          <aside className="hidden lg:block">
            <nav className="sticky top-24">
              <p className="mb-3 px-3 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">On this page</p>
              <ul className="space-y-0.5">
                {sections.map((s) => {
                  const on = active === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => scrollTo(s.id)}
                        className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${on ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"}`}
                      >
                        <s.icon className={`size-3.5 shrink-0 transition-colors ${on ? "text-accent" : "text-muted-foreground group-hover:text-foreground"}`} />
                        <span className="truncate">{s.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          {/* Content column */}
          <div className="mx-auto w-full max-w-[720px]">
            <div className="space-y-14 sm:space-y-20">
              {sections.map((s) => (
                <Reveal key={s.id}>
                  <section id={s.id} className="scroll-mt-24">
                    <div className="mb-5 flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
                        <s.icon className="size-5" />
                      </span>
                      <h2 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">{s.label}</h2>
                    </div>
                    <div className="text-sm sm:text-[15px] leading-relaxed text-foreground/85">{s.node}</div>
                  </section>
                  <div className="mt-14 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent sm:mt-20" />
                </Reveal>
              ))}
            </div>

            {/* Cross-links to related policy pages */}
            {related && <div className="mt-14 sm:mt-16">{related}</div>}

            {/* CTA */}
            {ctas && ctas.length > 0 && (
              <Reveal>
                <div className="mt-16 overflow-hidden rounded-3xl border border-accent/20 card-premium p-8 sm:p-12 text-center">
                  <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 blur-2xl" style={{ background: "var(--gradient-ember-soft)" }} />
                  <h3 className="relative text-2xl sm:text-3xl font-display font-semibold tracking-tight">Ready to explore?</h3>
                  <p className="relative mx-auto mt-2 max-w-md text-sm text-muted-foreground">Discover premium products from around the world, delivered with care.</p>
                  <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
                    {ctas.map((c) => (
                      <Link
                        key={c.label}
                        to={c.to}
                        params={c.params as never}
                        className={`group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-all active:scale-95 ${c.primary ? "bg-accent text-accent-foreground shadow-[0_8px_30px_-8px_var(--color-accent)] hover:shadow-[0_10px_40px_-6px_var(--color-accent)]" : "glass-strong border border-white/15 text-foreground hover:border-accent/40"}`}
                      >
                        {c.label}
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    ))}
                  </div>
                </div>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Reusable content building blocks ---------- */
export function StatGrid({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="card-premium rounded-2xl p-4 text-center">
          <p className="text-2xl sm:text-3xl font-display font-semibold text-gradient-ember">{s.value}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

export function FeatureCards({ items }: { items: { icon: ComponentType<LucideProps>; title: string; desc: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.title} className="group card-premium relative overflow-hidden rounded-2xl p-5">
          <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-accent/10 blur-2xl transition-opacity opacity-0 group-hover:opacity-100" />
          <span className="grid size-10 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
            <it.icon className="size-5" />
          </span>
          <h3 className="mt-3 text-[15px] font-display font-semibold">{it.title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{it.desc}</p>
        </div>
      ))}
    </div>
  );
}

export function CheckList({ items }: { items: { title: string; desc?: string }[] }) {
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.title} className="flex gap-3">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
            <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <span>
            <span className="font-medium text-foreground">{it.title}</span>
            {it.desc && <span className="text-muted-foreground">{" — "}{it.desc}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Timeline({ items }: { items: { year: string; title: string; desc: string }[] }) {
  return (
    <ol className="relative ml-2 border-l border-white/10">
      {items.map((it) => (
        <li key={it.title} className="relative mb-7 pl-6 last:mb-0">
          <span className="absolute -left-[7px] top-1 size-3.5 rounded-full border-2 border-accent bg-background shadow-[0_0_12px_var(--color-accent)]" />
          <p className="text-[11px] font-mono uppercase tracking-widest text-accent">{it.year}</p>
          <h3 className="mt-1 text-[15px] font-display font-semibold">{it.title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{it.desc}</p>
        </li>
      ))}
    </ol>
  );
}
