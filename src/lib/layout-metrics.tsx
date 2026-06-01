import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type LayoutMetrics = {
  viewportHeight: number;
  safeBottom: number;
  headerHeight: number;
  bottomNavHeight: number;
  ctaHeight: number;
  contentHeight: number;
};

type LayoutMetricsContextValue = LayoutMetrics & {
  ready: boolean;
  setCtaElement: (node: HTMLElement | null) => void;
  setExpectedCtaHeight: (height: number) => void;
};

const ZERO_METRICS: LayoutMetrics = {
  viewportHeight: 0,
  safeBottom: 0,
  headerHeight: 0,
  bottomNavHeight: 0,
  ctaHeight: 0,
  contentHeight: 0,
};

const LayoutMetricsContext = createContext<LayoutMetricsContextValue | null>(null);

function readCssPx(name: string) {
  if (typeof window === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function visibleHeight(selector: string) {
  if (typeof document === "undefined") return 0;
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).reduce((max, el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? Math.max(max, rect.height) : max;
  }, 0);
}

function almostEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.5;
}

export function LayoutMetricsProvider({ children }: { children: ReactNode }) {
  const ctaRef = useRef<HTMLElement | null>(null);
  const expectedCtaHeightRef = useRef(0);
  const [metrics, setMetrics] = useState<LayoutMetrics>(ZERO_METRICS);
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    if (typeof window === "undefined") return;

    // Use the LAYOUT viewport (clientHeight), not visualViewport.height.
    // visualViewport.height changes with pinch-zoom / browser scaling, which made
    // the product layout zoom-dependent and inconsistent across Android devices.
    const viewportHeight = Math.round(document.documentElement.clientHeight || window.innerHeight);
    const safeBottom = readCssPx("--mobile-safe-bottom");
    const headerHeight = visibleHeight("[data-app-header]");
    const bottomNavHeight = visibleHeight("[data-app-bottom-nav]");
    const ctaHeight = ctaRef.current?.getBoundingClientRect().height || expectedCtaHeightRef.current;
    const contentHeight = Math.max(0, viewportHeight - headerHeight - bottomNavHeight - ctaHeight);

    document.documentElement.style.setProperty("--app-viewport-height", `${viewportHeight}px`);
    document.documentElement.style.setProperty("--app-header-height", `${headerHeight}px`);
    document.documentElement.style.setProperty("--app-bottom-nav-height", `${bottomNavHeight}px`);
    document.documentElement.style.setProperty("--app-cta-height", `${ctaHeight}px`);
    document.documentElement.style.setProperty("--app-content-height", `${contentHeight}px`);

    setMetrics((prev) => {
      if (
        almostEqual(prev.viewportHeight, viewportHeight) &&
        almostEqual(prev.safeBottom, safeBottom) &&
        almostEqual(prev.headerHeight, headerHeight) &&
        almostEqual(prev.bottomNavHeight, bottomNavHeight) &&
        almostEqual(prev.ctaHeight, ctaHeight) &&
        almostEqual(prev.contentHeight, contentHeight)
      ) {
        return prev;
      }
      if (import.meta.env.DEV && window.matchMedia("(max-width: 767px)").matches) {
        console.debug("[layout-metrics] mobile viewport", {
          viewportHeight,
          safeAreaHeight: safeBottom,
          headerHeight,
          ctaHeight,
          bottomNavHeight,
          contentHeight,
        });
      }
      return { viewportHeight, safeBottom, headerHeight, bottomNavHeight, ctaHeight, contentHeight };
    });
    setReady(true);
  }, []);

  const setCtaElement = useCallback(
    (node: HTMLElement | null) => {
      ctaRef.current = node;
      requestAnimationFrame(measure);
    },
    [measure],
  );

  const setExpectedCtaHeight = useCallback(
    (height: number) => {
      expectedCtaHeightRef.current = Math.max(0, height);
      requestAnimationFrame(measure);
    },
    [measure],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    // NOTE: intentionally NOT listening to window.visualViewport resize/scroll.
    // Those fire on pinch-zoom and address-bar scaling and would make the layout
    // zoom-dependent. Layout must stay fixed relative to the layout viewport.

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    resizeObserver?.observe(document.body);
    document.querySelectorAll<HTMLElement>("[data-app-header], [data-app-bottom-nav]").forEach((el) => resizeObserver?.observe(el));

    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, [measure]);

  const value = useMemo<LayoutMetricsContextValue>(
    () => ({ ...metrics, ready, setCtaElement, setExpectedCtaHeight }),
    [metrics, ready, setCtaElement, setExpectedCtaHeight],
  );

  return <LayoutMetricsContext.Provider value={value}>{children}</LayoutMetricsContext.Provider>;
}

export function useLayoutMetrics() {
  const ctx = useContext(LayoutMetricsContext);
  if (!ctx) throw new Error("useLayoutMetrics must be used inside LayoutMetricsProvider");
  return ctx;
}