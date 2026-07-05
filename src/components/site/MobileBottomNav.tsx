import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Home, Search, Heart, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";
import { useAdminMode } from "@/lib/admin-mode";
import { useIsAdmin } from "@/lib/use-admin";

import { useSupportUnread } from "@/lib/use-support-unread";
import { useMotionTier } from "@/lib/motion-tier";
import { useSearchUI } from "@/lib/search-ui";

/**
 * Single-authority scroll state machine. State commits happen only on an rAF
 * boundary and only once per arbitration window, so Android inertia cannot make
 * competing listeners vibrate the dock between visual phases.
 */
type BottomNavState = "visible_full" | "visible_compact" | "hidden";

const TRANSITION_LOCK_MS = 180;
const SETTLE_LOCK_MS = 190;
const HIDDEN_LOCK_MS = 250; // hard lock: ignore scroll after entering hidden
const DEEP_SCROLL_Y = 220;
const FULL_RESTORE_Y = 56;
const DOWN_HIDE_VELOCITY = 0.55; // px/ms — sustained down = hide
const FAST_DOWN_VELOCITY = 1.25; // px/ms — flick = skip compact, hide instantly
const VELOCITY_BUFFER = 0.035; // signed px/ms hysteresis around rest
const VELOCITY_THROTTLE_MS = 60; // clamp: max one velocity measurement / 60ms
const MICRO_DELTA_PX = 8; // ignore sub-8px jitter mid-gesture
const DIRECTION_DEBOUNCE_MS = 120; // confirm scroll intent before honoring a flip

/**
 * Deterministic resolver. `current` is fed back in so the hidden phase is
 * "sticky": once docked away it only returns on upward intent (or near top),
 * which kills the settle-time flip-back that caused the blink.
 */
function resolveNavState(
  current: BottomNavState,
  scrollY: number,
  velocity: number,
  isScrolling: boolean,
): BottomNavState {
  // Upward intent is the priority signal — always restore.
  if (velocity < -VELOCITY_BUFFER) {
    return scrollY <= FULL_RESTORE_Y ? "visible_full" : "visible_compact";
  }

  // Sticky hidden: while docked away, keep it hidden until we scroll back up
  // or reach the top. Never return an intermediate state here → no flicker.
  if (current === "hidden") {
    return scrollY <= FULL_RESTORE_Y ? "visible_full" : "hidden";
  }

  if (isScrolling && scrollY > DEEP_SCROLL_Y) {
    if (velocity > FAST_DOWN_VELOCITY) return "hidden"; // flick → skip compact
    if (velocity > DOWN_HIDE_VELOCITY) return "hidden"; // sustained down → hide
  }

  return scrollY <= FULL_RESTORE_Y ? "visible_full" : "visible_compact";
}

export function MobileBottomNav() {
  const { count } = useCart();
  const { user } = useAuth();
  const { slugs } = useWishlist();
  const { adminMode } = useAdminMode();
  const { isAdmin } = useIsAdmin();
  
  const { count: supportUnread } = useSupportUnread();
  const motionTier = useMotionTier();
  const { openSearch } = useSearchUI();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [navState, setNavState] = useState<BottomNavState>("visible_full");
  const navStateRef = useRef<BottomNavState>("visible_full");
  // Staged reveal pipeline: container → icons → labels. Each stage is a pure
  // opacity/transform commit (no layout shift), gated by short timers so the
  // three phases never render simultaneously.
  const [iconsReady, setIconsReady] = useState(true);
  const [labelsReady, setLabelsReady] = useState(true);
  // Hydration gate: the dock stays fully transparent (no surface, no glass, no
  // shadow) until the client has mounted and theme tokens are resolved. This
  // eliminates the black/dark surface flash on hard refresh where the nav would
  // otherwise paint a solid fallback before the theme + fade-in are ready.
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  // The dock surface is a single fixed glass color, independent of theme, so we
  // no longer read/track the document theme here (nothing to switch on).
  useEffect(() => {
    // Frame 1: element enters the DOM in its transparent initial state.
    setMounted(true);
    // Frame 2: theme tokens + layout are resolved — reveal with a fade.
    const id = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => setReady(true));
      cleanup = () => cancelAnimationFrame(id2);
    });
    let cleanup = () => cancelAnimationFrame(id);
    return () => cleanup();
  }, []);

  const lastY = useRef(0);
  const lastT = useRef(0);
  const lastScrollAt = useRef(0);
  const lastCommit = useRef(0);

  useEffect(() => {
    let rafId = 0;
    let pendingScrolling = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let hiddenLockUntil = 0; // hard lock window after entering hidden
    let lastVelAt = 0; // velocity update clamp (max 1 per VELOCITY_THROTTLE_MS)
    let dirSign = 0; // last confirmed scroll direction (+1 down, -1 up)
    let dirSince = 0; // timestamp the current direction was confirmed

    const canUpdate = (now: number) => now - lastCommit.current > TRANSITION_LOCK_MS;

    const commit = (next: BottomNavState, now: number) => {
      if (next === navStateRef.current) return;
      if (!canUpdate(now)) {
        if (!pendingScrolling) {
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(
            () => schedule(false),
            Math.max(16, TRANSITION_LOCK_MS - (now - lastCommit.current) + 16),
          );
        }
        return;
      }
      navStateRef.current = next;
      lastCommit.current = now;
      // Entering hidden: freeze all further transitions for HIDDEN_LOCK_MS so the
      // final translateY(140%)/opacity:0 commit renders once, without flicker.
      if (next === "hidden") hiddenLockUntil = now + HIDDEN_LOCK_MS;
      setNavState(next);
    };

    const evaluate = () => {
      rafId = 0;
      const now = performance.now();
      const y = Math.max(window.scrollY, 0);

      // Hard hidden lock: ignore everything except an explicit scroll back to the
      // very top, which must never leave the dock stranded off-screen.
      if (now < hiddenLockUntil && navStateRef.current === "hidden") {
        if (y > FULL_RESTORE_Y) return;
      }

      // Velocity update clamp: at most one measurement per throttle window. We do
      // NOT advance the baseline until we measure, so the delta accumulates over
      // the window instead of collapsing to per-frame noise (Android inertia).
      if (pendingScrolling && now - lastVelAt < VELOCITY_THROTTLE_MS) return;

      const delta = y - lastY.current;
      const dt = Math.max(now - lastT.current, 1);

      // Ignore micro scroll jitter (<8px) while mid-gesture — never near the top,
      // where we always want to settle back to the full state.
      if (pendingScrolling && Math.abs(delta) < MICRO_DELTA_PX && y > FULL_RESTORE_Y) {
        return;
      }

      const velocity = delta / dt;
      lastY.current = y;
      lastT.current = now;
      lastVelAt = now;

      // Direction debounce buffer: confirm intent for 120ms before honoring a
      // flip. A genuine sustained gesture registers immediately (the prior
      // direction is stale), but sub-120ms up↔down finger jitter is suppressed
      // so the dock cannot re-enter COMPACT before the HIDDEN lock expires.
      const sign = velocity > VELOCITY_BUFFER ? 1 : velocity < -VELOCITY_BUFFER ? -1 : 0;
      if (sign !== 0 && sign !== dirSign) {
        if (dirSign !== 0 && now - dirSince < DIRECTION_DEBOUNCE_MS) return;
        dirSign = sign;
        dirSince = now;
      }

      const next = resolveNavState(navStateRef.current, y, velocity, pendingScrolling);
      commit(next, now);
    };


    const schedule = (isScrolling: boolean) => {
      pendingScrolling = isScrolling;
      if (rafId) return;
      rafId = requestAnimationFrame(evaluate);
    };

    const onScroll = () => {
      lastScrollAt.current = performance.now();
      if (settleTimer) clearTimeout(settleTimer);
      schedule(true);

      // One settle lock only: after the inertia tail is quiet, schedule a final
      // rAF commit. No React state updates happen inside this timeout.
      settleTimer = setTimeout(() => schedule(false), SETTLE_LOCK_MS);
    };


    const now = performance.now();
    lastY.current = Math.max(window.scrollY, 0);
    lastT.current = now;
    lastScrollAt.current = now;
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, []);

  // Staged reveal orchestration — STRICT sequence: container → icons → labels.
  // One-shot per reveal: the sequence runs ONLY on the hidden → visible edge, so
  // micro compact↔full flips during a gesture can never reset the pipeline back
  // to phase 1 (the bug that left the dock stuck icon-only with no labels).
  //
  // On first mount the dock is already visible, so there is NO reveal to play —
  // icons + labels start on screen (initial state `true`). `wasHidden` therefore
  // starts false: a reveal only plays after a genuine hidden phase.
  const wasHidden = useRef(false);
  // Motion tier is read through a ref so an async tier update (detected shortly
  // after mount) cannot re-run this effect, cancel the in-flight reveal timers,
  // and strand the dock icon-only / empty — the bug that left a black-looking
  // capsule with no icons after refresh.
  const motionTierRef = useRef(motionTier);
  motionTierRef.current = motionTier;
  useEffect(() => {
    const low = motionTierRef.current === "low";

    // Hidden → wipe everything and arm the next reveal to restart at phase 1.
    if (navState === "hidden") {
      wasHidden.current = true;
      setIconsReady(false);
      setLabelsReady(false);
      return;
    }

    // Already revealed (compact ↔ full flip, or first mount): keep icons + labels
    // on screen. This kills the reset loop on micro scroll updates and guarantees
    // the dock never renders as an empty (black-looking) capsule.
    if (!wasHidden.current) {
      setIconsReady(true);
      setLabelsReady(true);
      return;
    }

    // hidden → visible edge: play the one-shot staged reveal exactly once.
    wasHidden.current = false;
    setIconsReady(false);
    setLabelsReady(false);

    // Phase 2 — icons fade + rise (~120ms, ~60ms on low-end).
    const iconDelay = low ? 60 : 120;
    // Phase 3 — labels ALWAYS follow icons on any visible state (compact or
    // full), ~220ms from container visibility. Fired once; the compact↔full
    // guard above prevents any restart, so labels never get stranded.
    const labelDelay = low ? 140 : 220;
    const iconTimer = setTimeout(() => setIconsReady(true), iconDelay);
    const labelTimer = setTimeout(() => setLabelsReady(true), labelDelay);

    return () => {
      clearTimeout(iconTimer);
      clearTimeout(labelTimer);
    };
  }, [navState]);



  // Hand the bottom dock over to the admin bar when a staff member is actively
  // managing the store, so the two navigations never stack.
  if (adminMode && isAdmin) return null;
  // Hard hydration gate: never render the dock (not even a hidden shell) until
  // the client has mounted. This guarantees no surface paints on first frame.
  if (!mounted) return null;



  // The bottom-nav surface is intentionally theme-INDEPENDENT: one fixed glass
  // color for every theme and state, so no theme resolution is needed here to
  // pick a surface tone (avoids any hydration color switch / flash).

  const compact = navState !== "visible_full";
  const hidden = navState === "hidden";
  // Low tier (e.g. Android 8 / Oppo A3s WebView): opacity + translateY only.
  // No stagger, no icon scale, no breathing glow — the safety mode.
  const lowEnd = motionTier === "low";
  const stagger = !lowEnd;
  void stagger; // EXPERIMENT: stagger delay removed; keep ref to avoid unused var.

  const items: { to?: string; label: string; icon: typeof Home; match: (p: string) => boolean; badge?: number; onClick?: () => void }[] = [
    { to: "/", label: "Home", icon: Home, match: (p) => p === "/" },
    { to: "/search", label: "Browse", icon: Search, match: (p) => p === "/search" || p.startsWith("/category") },
    { to: "/wishlist", label: "Saved", icon: Heart, match: (p) => p === "/wishlist", badge: slugs.size },
    { to: "/cart", label: "Cart", icon: ShoppingBag, match: (p) => p === "/cart", badge: count },
    { to: user ? "/account" : "/auth", label: "Account", icon: User, match: (p) => p === "/account" || p === "/auth", badge: user ? supportUnread : 0 },
  ];

  return (
    <nav
      data-app-bottom-nav
      data-phase={navState}
      data-ready={ready ? "" : undefined}
      aria-label="Primary mobile navigation"
      style={{
        background: "transparent",
        opacity: ready ? 1 : 0,
        transform: ready ? "translateY(0)" : "translateY(16px)",
        visibility: ready ? "visible" : "hidden",
        // EXPERIMENT: compositing/animation stripped — no transform/opacity transition.
        transition: "none",

      }}
      className="md:hidden fixed inset-x-0 bottom-0 z-[var(--z-bottom-nav)] px-[max(0.875rem,var(--mobile-safe-left))] pb-[calc(var(--mobile-safe-bottom)+var(--mobile-nav-edge-gap))] pt-[var(--mobile-nav-top-gap)] pointer-events-none"
    >

      <ul
        data-compact={compact ? "" : undefined}
        // EXPERIMENT: compositing hint removed — no will-change.
        // NOTE: never set an inline `backdrop-filter` here — global safe-mode
        // selectors ([style*="backdrop-filter"]) would then recolor the dock to
        // a theme background. Blur is removed via the .nav-glass CSS class only,
        // keeping ONE fixed color across every device/state.
        className={
          // EXPERIMENT: transform-gpu removed, transition classes removed. Static.
          "nav-glass pointer-events-auto relative mx-auto grid max-w-md grid-cols-5 rounded-[30px] px-2" +
          ` h-[var(--mobile-nav-surface-height)] py-2 ${
            lowEnd ? "" : "shadow-[0_16px_42px_-18px_oklch(0_0_0/0.7)]"
          } ${
            hidden
              ? "translate-y-[140%] opacity-0 pointer-events-none"
              : compact
                ? lowEnd
                  ? "translate-y-0.5 opacity-100"
                  : "translate-y-0.5 opacity-100 shadow-[0_22px_54px_-16px_oklch(0_0_0/0.78)]"
                : "translate-y-0 opacity-100"
          }`
        }
        aria-hidden={hidden}
      >


        {items.map(({ to, label, icon: Icon, match, badge, onClick }, i) => {
          const active = match(pathname);
          const inner = (
            <>
                <span
                  className={`relative grid place-items-center size-9 rounded-2xl scale-100 ${
                    iconsReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
                  }`}
                >

                  {/* Soft radial energy field behind the active icon — a breathing
                      bloom. Runs ONLY in the fully-expanded state; frozen in
                      compact and disabled on low-end (Android safe mode).
                      EXPERIMENT: transition + animate-energy-breathe removed. */}
                  {!lowEnd && (
                    <span
                      aria-hidden
                      className={`absolute inset-0 rounded-full blur-[7px] [background:radial-gradient(circle,color-mix(in_oklab,var(--color-accent)_55%,transparent)_0%,transparent_70%)] ${
                        active && !compact ? "opacity-100" : "opacity-0"
                      }`}
                    />
                  )}

                  <span className="relative">
                    <Icon
                      className={`size-[21px] ${
                        active ? "text-accent" : "text-white/70"
                      }`}
                      strokeWidth={active ? 2.5 : 2}
                    />
                    {typeof badge === "number" && badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-accent-foreground ring-2 ring-background">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </span>
                </span>

                <span
                  aria-hidden={!labelsReady}
                  // EXPERIMENT: transition + stagger delay removed.
                  className={`h-3 max-w-full truncate leading-none ${
                    labelsReady ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-0.5 scale-90 opacity-0"
                  } ${
                    active ? "font-semibold text-accent" : "text-white/65"
                  }`}
                >
                  {label}
                </span>
            </>
          );
          const itemClass =
            "group flex h-full w-full min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-medium";
          return (
            <li key={label} className="min-w-0">
              {onClick ? (
                <button
                  type="button"
                  onClick={onClick}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  tabIndex={hidden ? -1 : undefined}
                  className={itemClass}
                >
                  {inner}
                </button>
              ) : (
                <Link
                  to={to}
                  aria-current={active ? "page" : undefined}
                  tabIndex={hidden ? -1 : undefined}
                  className={itemClass}
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
