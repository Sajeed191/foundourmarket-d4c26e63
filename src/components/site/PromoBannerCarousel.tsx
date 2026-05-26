import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  image: string | null;
  link: string | null;
  cta_text: string | null;
  sort_order: number;
};

export function PromoBannerCarousel() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  function fetchBanners() {
    supabase
      .from("banners")
      .select("id,title,subtitle,image,link,cta_text,sort_order,active,starts_at,ends_at,type")
      .eq("active", true)
      .in("type", ["promo", "hero", "offer"])
      .order("sort_order")
      .then(({ data }) => {
        const now = Date.now();
        const valid = ((data as any[]) ?? []).filter(
          (b) =>
            (!b.starts_at || new Date(b.starts_at).getTime() <= now) &&
            (!b.ends_at || new Date(b.ends_at).getTime() >= now),
        );
        setBanners(valid);
      });
  }

  useEffect(() => {
    fetchBanners();
    // Live updates: refetch whenever admin publishes/edits a banner
    const ch = supabase
      .channel("rt-banners-public")
      .on("postgres_changes", { event: "*", schema: "public", table: "banners" }, fetchBanners)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (paused || banners.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % banners.length), 6000);
    return () => clearInterval(id);
  }, [paused, banners.length]);

  if (!banners.length) return null;
  const b = banners[idx];
  const prev = () => setIdx((i) => (i - 1 + banners.length) % banners.length);
  const next = () => setIdx((i) => (i + 1) % banners.length);

  return (
    <section className="px-4 sm:px-6 pt-10 sm:pt-14">
      <div
        className="relative max-w-7xl mx-auto rounded-3xl overflow-hidden border border-border bg-card aspect-[16/7] sm:aspect-[21/8] group"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={b.id}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
          >
            {b.image ? (
              <img src={b.image} alt={b.title} className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0" style={{ background: "var(--gradient-ember)", opacity: 0.5 }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent" />
            <div className="relative h-full flex flex-col justify-center max-w-xl p-6 sm:p-12 md:p-16">
              <motion.h3
                initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.6 }}
                className="text-2xl sm:text-4xl md:text-5xl font-display tracking-tight mb-2 sm:mb-4"
              >
                {b.title}
              </motion.h3>
              {b.subtitle && (
                <motion.p
                  initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25, duration: 0.6 }}
                  className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6"
                >
                  {b.subtitle}
                </motion.p>
              )}
              {b.link && (
                <motion.a
                  href={b.link}
                  initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35, duration: 0.6 }}
                  className="inline-flex items-center gap-2 self-start bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs font-mono uppercase tracking-widest hover:gap-3 transition-all"
                >
                  {b.cta_text || "Shop now"} <ArrowRight className="size-3.5" />
                </motion.a>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {banners.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Previous banner"
              className="absolute left-3 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-full glass-strong opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground transition-all"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={next}
              aria-label="Next banner"
              className="absolute right-3 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-full glass-strong opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground transition-all"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {banners.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={`Go to banner ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === idx ? "w-8 bg-accent" : "w-1.5 bg-white/30 hover:bg-white/50"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
