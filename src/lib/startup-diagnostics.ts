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

  try {
    const existing = JSON.parse(localStorage.getItem("fom_startup_diagnostics") || "[]") as unknown[];
    const next = [...(Array.isArray(existing) ? existing : []), record].slice(-80);
    localStorage.setItem("fom_startup_diagnostics", JSON.stringify(next));
  } catch {
    /* storage may be blocked */
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