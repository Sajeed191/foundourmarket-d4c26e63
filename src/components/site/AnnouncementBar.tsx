import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminEditing } from "@/lib/admin-overlay";
import { AnnouncementIcon } from "@/lib/announcement-icons";
import { AnnouncementAdminSheet } from "@/components/admin/AnnouncementAdminSheet";
import { InlineActiveToggle } from "@/components/admin/InlineActiveToggle";

async function setAnnouncementActive(id: string, next: boolean) {
  const { error } = await supabase.from("announcements").update({ active: next }).eq("id", id);
  if (error) throw error;
}
import { cn } from "@/lib/utils";

export type Announcement = {
  id: string;
  message: string;
  icon: string;
  type: string;
  link: string | null;
  cta_text: string | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  countdown_to: string | null;
  region: string;
  pages: string[];
  sort_order: number;
};

const FALLBACK: Announcement[] = [
  { id: "f1", message: "Free worldwide shipping on orders over $50", icon: "truck", type: "shipping", link: null, cta_text: null, active: true, starts_at: null, ends_at: null, countdown_to: null, region: "all", pages: [], sort_order: 10 },
  { id: "f2", message: "New arrivals just landed — fresh drops daily", icon: "sparkles", type: "info", link: null, cta_text: null, active: true, starts_at: null, ends_at: null, countdown_to: null, region: "all", pages: [], sort_order: 30 },
];

const TYPE_GRADIENT: Record<string, string> = {
  info: "var(--gradient-ember-soft)",
  sale: "radial-gradient(circle at 50% 0%, oklch(0.7 0.2 25 / 0.45), transparent 70%)",
  shipping: "var(--gradient-ember-soft)",
  launch: "radial-gradient(circle at 50% 0%, oklch(0.6 0.18 280 / 0.4), transparent 70%)",
  urgent: "radial-gradient(circle at 50% 0%, oklch(0.65 0.24 20 / 0.5), transparent 70%)",
};

function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return null;
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Live, DB-backed announcement bar. Auto-rotates active announcements and
 * realtime-syncs on any change. Staff see an inline edit affordance that opens
 * a full CMS bottom sheet — customers never see it (RLS + role gated).
 */
export function AnnouncementBar({ page = "home" }: { page?: string }) {
  const { canEdit } = useAdminEditing();
  const [items, setItems] = useState<Announcement[]>(FALLBACK);
  const [loaded, setLoaded] = useState(false);
  const [i, setI] = useState(0);
  const [editing, setEditing] = useState(false);

  function fetchItems() {
    supabase
      .from("announcements")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        const now = Date.now();
        const valid = ((data as Announcement[]) ?? []).filter(
          (a) =>
            (canEdit ||
              (a.active &&
                (!a.starts_at || new Date(a.starts_at).getTime() <= now) &&
                (!a.ends_at || new Date(a.ends_at).getTime() >= now))) &&
            (a.pages.length === 0 || a.pages.includes(page)),
        );
        setItems(valid.length ? valid : loaded ? [] : FALLBACK);
        setLoaded(true);
      });
  }

  useEffect(() => {
    fetchItems();
    const ch = supabase
      .channel("rt-announcements")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, fetchItems)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, canEdit]);

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setI((p) => (p + 1) % items.length), 4500);
    return () => clearInterval(t);
  }, [items.length]);

  const safeIndex = items.length ? i % items.length : 0;
  const current = items[safeIndex];
  const countdown = useCountdown(current?.countdown_to ?? null);

  const gradient = useMemo(
    () => (current ? TYPE_GRADIENT[current.type] ?? TYPE_GRADIENT.info : TYPE_GRADIENT.info),
    [current],
  );

  if (!current && !canEdit) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Announcements"
        className="relative h-9 overflow-hidden border-b border-accent/15 bg-background/80 backdrop-blur-md"
      >
        <div aria-hidden className="absolute inset-0 opacity-40 pointer-events-none" style={{ background: gradient }} />
        <div className="relative h-full max-w-7xl mx-auto px-4 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-2 text-[11px] sm:text-xs font-mono uppercase tracking-[0.2em] text-foreground/90"
              >
                <AnnouncementIcon icon={current.icon} className="size-3.5 text-accent shrink-0" />
                {current.link ? (
                  <a href={current.link} className="truncate hover:text-accent transition-colors">
                    {current.message}
                  </a>
                ) : (
                  <span className="truncate">{current.message}</span>
                )}
                {countdown && (
                  <span className="ml-1 rounded-full bg-accent/15 px-2 py-0.5 text-accent tabular-nums normal-case tracking-normal">
                    {countdown}
                  </span>
                )}
                {current.cta_text && current.link && (
                  <a href={current.link} className="ml-1 hidden sm:inline text-accent underline-offset-2 hover:underline">
                    {current.cta_text}
                  </a>
                )}
              </motion.div>
            ) : (
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                No active announcements
              </span>
            )}
          </AnimatePresence>
        </div>

        {canEdit && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5">
            {current && !String(current.id).startsWith("f") && (
              <InlineActiveToggle
                active={current.active}
                label="Announcement"
                size="sm"
                onToggle={(next) => setAnnouncementActive(current.id, next)}
              />
            )}
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit announcements"
              className={cn(
                "grid size-6 place-items-center rounded-full",
                "border border-accent/40 bg-background/70 text-accent backdrop-blur-md transition-all hover:bg-accent/15",
              )}
            >
              <Pencil className="size-3" />
            </button>
          </div>
        )}
      </div>

      {canEdit && editing && <AnnouncementAdminSheet onClose={() => setEditing(false)} onChanged={fetchItems} />}
    </>
  );
}
