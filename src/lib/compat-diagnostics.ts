/**
 * Compatibility diagnostics collector — used by the "Advanced Graphics Help"
 * dialog. Reads only standard, already-available browser signals (no new
 * permissions, no browser-flag access — which browsers do not expose to web
 * pages). Purely informational, for copy-to-clipboard bug reports.
 */
import { getCompatReason, isGpuUnsafe } from "@/lib/gpu-compat";

export type CompatDiagnostics = {
  browserName: string;
  browserVersion: string;
  operatingSystem: string;
  webglRenderer: string;
  webglVendor: string;
  compatibilityMode: string;
  compatibilityReason: string;
  /** True when the detected browser is Chromium-based (Chrome/Edge/Brave/etc). */
  isChromium: boolean;
};

function parseBrowser(ua: string): { name: string; version: string; isChromium: boolean } {
  // Order matters: Edge/Brave/Opera masquerade with "Chrome" in the UA.
  const tests: { name: string; re: RegExp; chromium: boolean }[] = [
    { name: "Microsoft Edge", re: /Edg(?:A|iOS)?\/([\d.]+)/, chromium: true },
    { name: "Opera", re: /OPR\/([\d.]+)/, chromium: true },
    { name: "Samsung Internet", re: /SamsungBrowser\/([\d.]+)/, chromium: true },
    { name: "Firefox", re: /Firefox\/([\d.]+)/, chromium: false },
    { name: "Chrome", re: /Chrome\/([\d.]+)/, chromium: true },
    { name: "Safari", re: /Version\/([\d.]+).*Safari/, chromium: false },
  ];
  for (const t of tests) {
    const m = ua.match(t.re);
    if (m) return { name: t.name, version: m[1], isChromium: t.chromium };
  }
  return { name: "Unknown", version: "unknown", isChromium: /Chrome\//.test(ua) };
}

function parseOS(ua: string): string {
  if (/Windows NT 10/.test(ua)) return "Windows 10/11";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Android\s([\d.]+)/.test(ua)) return `Android ${RegExp.$1}`;
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

function readWebgl(): { renderer: string; vendor: string } {
  if (typeof document === "undefined") return { renderer: "unknown", vendor: "unknown" };
  const attr = document.documentElement.getAttribute("data-gpu-renderer");
  let renderer = attr && attr !== "unknown" ? attr : "unknown";
  let vendor = "unknown";
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") ||
      c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        if (renderer === "unknown")
          renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
        vendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
      } else {
        if (renderer === "unknown") renderer = String(gl.getParameter(gl.RENDERER));
        vendor = String(gl.getParameter(gl.VENDOR));
      }
    }
  } catch {
    /* WebGL unavailable */
  }
  return { renderer, vendor };
}

export function collectCompatDiagnostics(): CompatDiagnostics {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const browser = parseBrowser(ua);
  const gl = readWebgl();
  const reason = getCompatReason();
  return {
    browserName: browser.name,
    browserVersion: browser.version,
    operatingSystem: parseOS(ua),
    webglRenderer: gl.renderer,
    webglVendor: gl.vendor,
    compatibilityMode: isGpuUnsafe() ? "Enabled" : "Disabled",
    compatibilityReason:
      reason === "gpu"
        ? "GPU rendering issue (compositor tile corruption)"
        : reason === "engine"
          ? "Outdated browser engine"
          : "Not active",
    isChromium: browser.isChromium,
  };
}

export function formatDiagnostics(d: CompatDiagnostics): string {
  return [
    `Browser: ${d.browserName} ${d.browserVersion}`,
    `Operating System: ${d.operatingSystem}`,
    `WebGL Renderer: ${d.webglRenderer}`,
    `WebGL Vendor: ${d.webglVendor}`,
    `Compatibility Mode: ${d.compatibilityMode}`,
    `Compatibility Reason: ${d.compatibilityReason}`,
  ].join("\n");
}
