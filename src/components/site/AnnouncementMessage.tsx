import { AnnouncementIcon } from "@/lib/announcement-icons";
import type { Announcement } from "./AnnouncementBar";

/**
 * Static (framer-motion-free) announcement message. Used as the SSR / first-paint
 * render and as the Suspense fallback while the motion-enhanced version loads.
 * Keeps the announcement bar out of the framer-motion initial bundle.
 */

export const ANNOUNCE_ROW =
  "flex items-center gap-2 text-[11px] sm:text-xs font-mono uppercase tracking-[0.2em] text-foreground/90";

export function AnnouncementInner({
  current,
  countdown,
}: {
  current: Announcement;
  countdown: string | null;
}) {
  return (
    <>
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
    </>
  );
}

export function StaticAnnouncement({
  current,
  countdown,
}: {
  current: Announcement | null;
  countdown: string | null;
}) {
  if (!current)
    return (
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        No active announcements
      </span>
    );
  return (
    <div className={ANNOUNCE_ROW}>
      <AnnouncementInner current={current} countdown={countdown} />
    </div>
  );
}
