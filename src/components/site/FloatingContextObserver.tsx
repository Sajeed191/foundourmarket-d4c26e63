import { useEffect } from "react";
import { setFooterLift, setContextHidden } from "@/lib/floating-stack";

/**
 * Floating Widgets v1.1 — global context observer.
 *
 * - Smart Footer Avoidance: on scroll/resize, compute how many pixels the
 *   floating widgets must lift so they clear the site <footer> with ≥24px.
 *   Passive scroll listener, rAF-throttled, no layout thrash beyond a single
 *   getBoundingClientRect per frame while scrolling.
 * - Context Awareness: mirror `document.fullscreenElement` into the floating
 *   stack so widgets hide during native fullscreen (image zoom, video, etc.)
 *   and restore automatically on exit.
 */
export function FloatingContextObserver() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const CLEARANCE = 24;
    let footerEl: HTMLElement | null = null;
    let ticking = false;

    const resolveFooter = () => {
      if (footerEl && footerEl.isConnected) return footerEl;
      footerEl = document.querySelector("footer");
      return footerEl;
    };

    const compute = () => {
      ticking = false;
      const el = resolveFooter();
      if (!el) {
        setFooterLift(0);
        return;
      }
      const rect = el.getBoundingClientRect();
      const vv = window.visualViewport;
      const viewportBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
      const cs = getComputedStyle(document.documentElement);
      const navRaw = cs.getPropertyValue("--floating-bottom-offset").trim();
      let navH = 0;
      const n = parseFloat(navRaw);
      if (Number.isFinite(n) && !navRaw.includes("calc")) navH = n;
      const currentBottom = viewportBottom - navH;
      const desiredBottom = rect.top - CLEARANCE;
      const lift = currentBottom - desiredBottom;
      setFooterLift(Math.min(lift, window.innerHeight * 0.55));
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(compute);
    };

    // Initial pass after layout settles.
    const raf = requestAnimationFrame(compute);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("orientationchange", onScroll);
    window.visualViewport?.addEventListener("resize", onScroll);
    window.visualViewport?.addEventListener("scroll", onScroll);

    const onFs = () => setContextHidden(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("orientationchange", onScroll);
      window.visualViewport?.removeEventListener("resize", onScroll);
      window.visualViewport?.removeEventListener("scroll", onScroll);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);
  return null;
}
