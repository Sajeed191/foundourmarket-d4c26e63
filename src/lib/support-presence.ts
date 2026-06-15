import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { derivePresence, type PresenceState } from "@/lib/support-analytics";

/**
 * Phase 6B — Activity-derived support presence.
 *
 * Presence is NEVER set manually. Staff "heartbeat" their last activity
 * timestamp whenever they perform a real support action (send message, open
 * ticket, change status, assign, internal note, dashboard activity). The state
 * (online / away / offline) is then derived purely from how recently that
 * timestamp was written — see `derivePresence` in support-analytics.
 */

export type PresenceRow = { user_id: string; last_active_at: string; last_action: string | null };

/** Record a staff activity heartbeat. Safe to call often — it upserts a single row. */
export async function pingPresence(action: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;
  await (supabase.from("support_agent_presence") as any).upsert(
    { user_id: uid, last_active_at: new Date().toISOString(), last_action: action },
    { onConflict: "user_id" },
  );
}

/**
 * Staff-facing presence directory. Loads every agent's last-activity row,
 * subscribes to realtime changes, and re-ticks every 30s so derived states
 * decay (online → away → offline) without a refetch.
 */
export function useAgentPresence(enabled = true) {
  const [rows, setRows] = useState<Map<string, PresenceRow>>(new Map());
  const [tick, setTick] = useState(() => Date.now());
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const { data } = await (supabase.from("support_agent_presence") as any)
      .select("user_id,last_active_at,last_action");
    if (!mounted.current) return;
    const m = new Map<string, PresenceRow>();
    for (const r of (data ?? []) as PresenceRow[]) m.set(r.user_id, r);
    setRows(m);
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return;
    load();
    const ch = supabase
      .channel(`agent-presence-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_agent_presence" }, () => load())
      .subscribe();
    const poll = setInterval(() => setTick(Date.now()), 30000);
    return () => { mounted.current = false; supabase.removeChannel(ch); clearInterval(poll); };
  }, [enabled, load]);

  const presenceOf = useCallback(
    (userId: string | null | undefined): { state: PresenceState; lastActiveAt: string | null } => {
      if (!userId) return { state: "offline", lastActiveAt: null };
      const r = rows.get(userId);
      return { state: derivePresence(r?.last_active_at, tick), lastActiveAt: r?.last_active_at ?? null };
    },
    [rows, tick],
  );

  return { rows, presenceOf, tick, refresh: load };
}

export type SupportAvailability = {
  state: PresenceState;
  onlineCount: number;
  awayCount: number;
  lastActiveAt: string | null;
};

/**
 * Customer-facing aggregate availability. Calls the name-free
 * `support_availability` RPC and refreshes on presence changes + a 60s poll.
 * Never exposes individual staff identities.
 */
export function useSupportAvailability() {
  const [data, setData] = useState<SupportAvailability>({
    state: "offline", onlineCount: 0, awayCount: 0, lastActiveAt: null,
  });
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const { data: res } = await (supabase.rpc as any)("support_availability");
    if (!mounted.current || !res) return;
    const online = Number(res.online_count ?? 0);
    const away = Number(res.away_count ?? 0);
    const state: PresenceState = online > 0 ? "online" : away > 0 ? "away" : "offline";
    setData({ state, onlineCount: online, awayCount: away, lastActiveAt: res.last_active_at ?? null });
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const ch = supabase
      .channel(`support-availability-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_agent_presence" }, () => load())
      .subscribe();
    const poll = setInterval(load, 60000);
    return () => { mounted.current = false; supabase.removeChannel(ch); clearInterval(poll); };
  }, [load]);

  return data;
}

/**
 * Phase 6C — Realtime-only typing indicators.
 *
 * Uses Supabase Realtime broadcast on a per-ticket channel. Nothing is ever
 * written to the database. The other party's "typing" state auto-expires after
 * 5s of silence; outgoing broadcasts are debounced to at most one every ~1.5s.
 */
export function useTypingIndicator(ticketId: string | null, myRole: "staff" | "customer") {
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSentRef = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ticketId) return;
    setOtherTyping(false);
    const ch = supabase.channel(`typing:${ticketId}`, { config: { broadcast: { self: false } } });
    const onActivity = (payload: any) => {
      if (payload?.payload?.role === myRole) return; // ignore my own echoes
      setOtherTyping(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setOtherTyping(false), 5000);
    };
    const onStop = (payload: any) => {
      if (payload?.payload?.role === myRole) return;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setOtherTyping(false);
    };
    ch.on("broadcast", { event: "typing" }, onActivity)
      .on("broadcast", { event: "stop" }, onStop)
      .subscribe();
    channelRef.current = ch;
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = null;
      supabase.removeChannel(ch);
      channelRef.current = null;
      setOtherTyping(false);
    };
  }, [ticketId, myRole]);

  const notifyTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastSentRef.current < 1500) return; // debounce broadcasts
    lastSentRef.current = now;
    void ch.send({ type: "broadcast", event: "typing", payload: { role: myRole } });
  }, [myRole]);

  const notifyStop = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    lastSentRef.current = 0;
    void ch.send({ type: "broadcast", event: "stop", payload: { role: myRole } });
  }, [myRole]);

  return { otherTyping, notifyTyping, notifyStop };
}

/** "2 minutes ago", "15 minutes ago", "1 hour ago", "just now". */
export function fmtLastActive(ts: string | number | null | undefined, now = Date.now()): string {
  if (ts == null) return "never";
  const t = typeof ts === "number" ? ts : new Date(ts).getTime();
  if (!Number.isFinite(t)) return "never";
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const d = Math.round(hr / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
