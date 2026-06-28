import { useEffect, useRef } from "react";

type DiagnosticPayload = Record<string, unknown>;

declare global {
  interface Window {
    __fomDiag?: (event: string, payload?: DiagnosticPayload) => void;
    __fomShowStartupError?: (reason?: unknown) => void;
  }
}

let installed = false;
let fetchPatched = false;
let compositorDiagnosticsInstalled = false;
const diagnosticBuffer: unknown[] = [];
let persistScheduled = false;

function cleanUrl(input: unknown): string {
  try {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input instanceof Request
            ? input.url
            : String(input ?? "");
    const url = new URL(raw, window.location.href);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "unknown";
  }
}

function reasonText(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

export function logDiagnostic(event: string, payload: DiagnosticPayload = {}): void {
  if (typeof window === "undefined") return;
  const record = {
    event,
    at: new Date().toISOString(),
    path: window.location.pathname,
    payload,
  };

  diagnosticBuffer.push(record);
  if (diagnosticBuffer.length > 80) diagnosticBuffer.splice(0, diagnosticBuffer.length - 80);

  if (!persistScheduled) {
    persistScheduled = true;
    const persist = () => {
      persistScheduled = false;
      try {
        const existing = JSON.parse(localStorage.getItem("fom_startup_diagnostics") || "[]") as unknown[];
        const next = [...(Array.isArray(existing) ? existing : []), ...diagnosticBuffer].slice(-80);
        diagnosticBuffer.length = 0;
        localStorage.setItem("fom_startup_diagnostics", JSON.stringify(next));
      } catch {
        diagnosticBuffer.length = 0;
        /* storage may be blocked */
      }
    };
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(persist, { timeout: 1500 });
    else window.setTimeout(persist, 250);
  }

  try {
    const level = /error|fail|reject|crash|blocked|high-memory|reload/i.test(event) ? "warn" : "info";
    console[level]("[startup-diagnostics]", event, payload);
  } catch {
    /* console may be unavailable */
  }

  try {
    window.__fomDiag?.(event, payload);
  } catch {
    /* external diagnostic hook must never break startup */
  }
}

function patchFetch(): void {
  if (fetchPatched || typeof window === "undefined" || typeof window.fetch !== "function") return;
  fetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    try {
      const response = await originalFetch(input, init);
      if (!response.ok) {
        logDiagnostic("network-http-failure", {
          url: cleanUrl(input),
          status: response.status,
          method: init?.method || (input instanceof Request ? input.method : "GET"),
          durationMs: Math.round(performance.now() - started),
        });
      }
      return response;
    } catch (error) {
      logDiagnostic("network-fetch-rejection", {
        url: cleanUrl(input),
        method: init?.method || (input instanceof Request ? input.method : "GET"),
        durationMs: Math.round(performance.now() - started),
        error: reasonText(error),
      });
      throw error;
    }
  };
}

function logMemory(label: string): void {
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  }).memory;
  if (!memory) {
    logDiagnostic("memory-unsupported", { label });
    return;
  }
  const usedMb = Math.round(memory.usedJSHeapSize / 1048576);
  const totalMb = Math.round(memory.totalJSHeapSize / 1048576);
  const limitMb = Math.round(memory.jsHeapSizeLimit / 1048576);
  const ratio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
  logDiagnostic(ratio > 0.82 ? "memory-high" : "memory-sample", {
    label,
    usedMb,
    totalMb,
    limitMb,
    percent: Math.round(ratio * 100),
  });
}

function logServiceWorkerState(): void {
  if (!("serviceWorker" in navigator)) {
    logDiagnostic("service-worker-unsupported");
    return;
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    logDiagnostic("service-worker-controllerchange");
  });
  navigator.serviceWorker.addEventListener("message", (event) => {
    logDiagnostic("service-worker-message", { dataType: typeof event.data });
  });

  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      logDiagnostic("service-worker-registrations", { count: registrations.length });
      registrations.forEach((registration) => {
        logDiagnostic("service-worker-registration", {
          scope: registration.scope,
          active: registration.active?.state,
          waiting: registration.waiting?.state,
          installing: registration.installing?.state,
        });
        registration.addEventListener("updatefound", () => {
          logDiagnostic("service-worker-updatefound", { scope: registration.scope });
        });
      });
    })
    .catch((error) => logDiagnostic("service-worker-read-failed", { error: reasonText(error) }));
}

function isUltraLowEndAndroid(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.ultraLowEnd === "true";
}

function installCompositorDiagnostics(): void {
  if (compositorDiagnosticsInstalled || typeof window === "undefined" || typeof document === "undefined") return;
  compositorDiagnosticsInstalled = true;

  const snapshot = (label: string) => {
    if (!isUltraLowEndAndroid()) return;
    const selector = [
      "[style*='transform']",
      "[style*='filter']",
      "[style*='backdrop']",
      "[style*='will-change']",
      "[class*='translate']",
      "[class*='scale']",
      "[class*='rotate']",
      "[class*='blur']",
      "[class*='backdrop-blur']",
      "[class*='animate-']",
      "[class*='shadow-']",
    ].join(",");
    logDiagnostic("compositor-snapshot", {
      label,
      candidates: document.querySelectorAll(selector).length,
      productCards: document.querySelectorAll("[data-product-card]").length,
      productImages: document.querySelectorAll("[data-product-image]").length,
    });
  };

  const scheduleSnapshot = (label: string) => {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => snapshot(label), { timeout: 2000 });
    else window.setTimeout(() => snapshot(label), 750);
  };

  const isLayerCandidate = (element: Element): boolean => {
    const value = `${element.getAttribute("class") ?? ""} ${element.getAttribute("style") ?? ""}`;
    return /transform|translate|scale|rotate|blur|backdrop|filter|will-change|contain|isolation|animate-|shadow-|mask/i.test(value);
  };

  const installLayerMutationProbe = () => {
    if (!isUltraLowEndAndroid() || typeof MutationObserver === "undefined") return;
    let mutationCount = 0;
    let candidateCount = 0;
    let lastSample = "";
    const flush = () => {
      if (!mutationCount) return;
      logDiagnostic("compositor-layer-mutations", {
        mutations: mutationCount,
        layerCandidateMutations: candidateCount,
        sample: lastSample,
      });
      mutationCount = 0;
      candidateCount = 0;
      lastSample = "";
    };
    const timer = window.setInterval(flush, 3000);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "attributes") continue;
        mutationCount += 1;
        const target = mutation.target;
        if (target instanceof Element && isLayerCandidate(target)) {
          candidateCount += 1;
          if (!lastSample) {
            const tag = target.tagName.toLowerCase();
            const id = target.id ? `#${target.id}` : "";
            const cls = (target.getAttribute("class") ?? "").toString().slice(0, 120);
            lastSample = `${tag}${id}${cls ? `.${cls.replace(/\s+/g, ".")}` : ""}`;
          }
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    window.setTimeout(() => {
      flush();
      observer.disconnect();
      window.clearInterval(timer);
      logDiagnostic("compositor-layer-mutation-probe-stopped", { durationMs: 45_000 });
    }, 45_000);
    logDiagnostic("compositor-layer-mutation-probe-started", { durationMs: 45_000 });
  };

  document.addEventListener(
    "webglcontextlost",
    (event) => {
      logDiagnostic("gpu-context-lost", {
        target: (event.target as Element | null)?.tagName ?? "unknown",
      });
    },
    true,
  );
  document.addEventListener(
    "webglcontextrestored",
    (event) => {
      logDiagnostic("gpu-context-restored", {
        target: (event.target as Element | null)?.tagName ?? "unknown",
      });
    },
    true,
  );

  window.addEventListener("pageshow", () => scheduleSnapshot("pageshow"));
  window.addEventListener("orientationchange", () => scheduleSnapshot("orientationchange"));
  document.addEventListener(
    "error",
    (event) => {
      const target = event.target as HTMLImageElement | null;
      if (target?.matches?.("[data-product-image]")) {
        logDiagnostic("product-image-error", {
          src: cleanUrl(target.currentSrc || target.src),
          naturalWidth: target.naturalWidth,
          naturalHeight: target.naturalHeight,
        });
      }
    },
    true,
  );
  scheduleSnapshot("startup");
  installLayerMutationProbe();
}

export function installStartupDiagnostics(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  logDiagnostic("diagnostics-installed", {
    userAgent: navigator.userAgent,
    memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? "unknown",
    cores: navigator.hardwareConcurrency ?? "unknown",
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    enhancedProtectionDetectable: false,
  });

  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  logDiagnostic("navigation-start", {
    type: nav?.type ?? "unknown",
    redirectCount: nav?.redirectCount ?? 0,
    activationStart: Math.round(
      ((nav as (PerformanceNavigationTiming & { activationStart?: number }) | undefined)
        ?.activationStart) ?? 0,
    ),
  });

  patchFetch();
  logServiceWorkerState();
  installCompositorDiagnostics();
  logMemory("startup");

  window.addEventListener("error", (event) => {
    const target = event.target as HTMLElement | null;
    const resource = target && ((target as HTMLScriptElement).src || (target as HTMLLinkElement).href || (target as HTMLImageElement).currentSrc || (target as HTMLImageElement).src);
    logDiagnostic(resource ? "resource-load-error" : "uncaught-error", {
      message: event.message || "resource failed",
      source: resource ? cleanUrl(resource) : cleanUrl(event.filename),
      line: event.lineno,
      column: event.colno,
      error: reasonText(event.error),
    });
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    logDiagnostic("unhandled-promise-rejection", { reason: reasonText(event.reason) });
  });

  window.addEventListener("pageshow", (event) => {
    logDiagnostic("page-show", { persisted: event.persisted });
  });
  window.addEventListener("pagehide", (event) => {
    logDiagnostic("page-hide", { persisted: event.persisted });
  });
  window.addEventListener("beforeunload", () => {
    logDiagnostic("before-unload");
  });
  document.addEventListener("visibilitychange", () => {
    logDiagnostic("visibility-change", { state: document.visibilityState });
    if (document.visibilityState === "visible") logMemory("visible");
  });

  let samples = 0;
  const memoryTimer = window.setInterval(() => {
    samples += 1;
    logMemory(`sample-${samples}`);
    if (samples >= 8) window.clearInterval(memoryTimer);
  }, 15_000);
}

export function useRenderDiagnostics(name: string, payload: DiagnosticPayload = {}): void {
  const count = useRef(0);
  count.current += 1;
  useEffect(() => {
    const current = count.current;
    if (current === 1 || current === 2 || current === 5 || current === 10 || current % 25 === 0) {
      logDiagnostic(current >= 25 ? "render-count-high" : "render-count", {
        component: name,
        count: current,
        ...payload,
      });
    }
  });
}