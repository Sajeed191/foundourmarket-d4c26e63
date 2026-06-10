import { AnimatePresence, motion } from "framer-motion";
import type { Announcement } from "./AnnouncementBar";
import { ANNOUNCE_ROW, AnnouncementInner } from "./AnnouncementMessage";

/**
 * framer-motion crossfade for the rotating announcement bar. Loaded lazily so
 * framer-motion stays out of the homepage initial bundle; the static version
 * renders first and this swaps in after hydration with identical visuals.
 */
export default function MotionAnnouncement({
  current,
  countdown,
}: {
  current: Announcement | null;
  countdown: string | null;
}) {
  return (
    <AnimatePresence mode="wait">
      {current ? (
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={ANNOUNCE_ROW}
        >
          <AnnouncementInner current={current} countdown={countdown} />
        </motion.div>
      ) : (
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          No active announcements
        </span>
      )}
    </AnimatePresence>
  );
}
