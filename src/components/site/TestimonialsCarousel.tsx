import { useEffect, useRef, useState } from "react";
import { Star, BadgeCheck } from "lucide-react";
import { useLowEndDevice } from "@/lib/use-low-end-device";

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  flag: string;
  country: string;
};

const AUTO_MS = 5000;

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <span className="size-9 shrink-0 grid place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30 text-xs font-semibold">
      {initials}
    </span>
  );
}

function Card({ t }: { t: Testimonial }) {
  return (
    <figure className="group relative glass glass-reflect rounded-2xl p-4 sm:p-5 h-full flex flex-col overflow-hidden hover:-translate-y-1 transition-transform duration-200">
      <div aria-hidden className="absolute -top-10 -right-10 size-32 rounded-full opacity-30 group-hover:opacity-60 transition-opacity blur-2xl" style={{ background: "var(--gradient-ember-soft)" }} />
      <div className="relative flex gap-0.5 text-accent mb-2.5">
        {Array.from({ length: 5 }).map((_, s) => (
          <Star key={s} className="size-3.5 fill-current" />
        ))}
      </div>
      <blockquote className="relative text-sm leading-relaxed text-pretty flex-1">"{t.quote}"</blockquote>
      <figcaption className="relative mt-4 pt-3.5 border-t border-border flex items-center gap-3">
        <Avatar name={t.name} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate flex items-center gap-1.5">
            {t.name}
            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide text-accent">
              <BadgeCheck className="size-3" /> Verified
            </span>
          </div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5 flex items-center gap-1">
            <span aria-hidden>{t.flag}</span> {t.country}
          </div>
        </div>
      </figcaption>
    </figure>
  );
}

export function TestimonialsCarousel({ items }: { items: Testimonial[] }) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const lowEnd = useLowEndDevice();

  useEffect(() => {
    if (lowEnd || items.length <= 1) return;
    const id = setInterval(() => {
      if (paused.current) return;
      setIndex((i) => (i + 1) % items.length);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [items.length, lowEnd]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const child = el.children[index] as HTMLElement | undefined;
    if (child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: lowEnd ? "auto" : "smooth" });
  }, [index, lowEnd]);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / (el.clientWidth * 0.86));
    if (i !== index && i >= 0 && i < items.length) setIndex(i);
  }

  return (
    <div className="md:hidden">
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={() => (paused.current = true)}
        onPointerUp={() => (paused.current = false)}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
      >
        {items.map((t) => (
          <div key={t.name} className="snap-center shrink-0 w-[86%]">
            <Card t={t} />
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 mt-3">
        {items.map((t, i) => (
          <button
            key={t.name}
            aria-label={`Go to testimonial ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? "w-5 bg-accent" : "w-1.5 bg-white/25"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
