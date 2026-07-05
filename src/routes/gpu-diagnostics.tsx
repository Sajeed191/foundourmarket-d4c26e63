import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

export const Route = createFileRoute("/gpu-diagnostics")({
  component: GpuDiagnostics;
});

/* ============================================================================
 * GPU / DRIVER DIAGNOSTICS — standalone, no application imports.
 * Reads WebGL renderer/vendor + capabilities, shows them on screen, and lets
 * the user copy/download the report as JSON. No ProductCard, no CSS changes,
 * no rendering changes to production. Read-only probe.
 * ========================================================================== */

type Diag = {
  collectedAt: string;
  userAgent: string;
  userAgentData: unknown;
  platform: string;
  deviceMemory: unknown;
  hardwareConcurrency: unknown;
  devicePixelRatio: number;
  screen: { width: number; height: number; availWidth: number; availHeight: number };
  webgl: {
    contextType: "webgl2" | "webgl" | "none";
    vendor: string | null;
    renderer: string | null;
    unmaskedVendor: string | null;
    unmaskedRenderer: string | null;
    version: string | null;
    shadingLanguageVersion: string | null;
    maxTextureSize: number | null;
    maxRenderbufferSize: number | null;
    maxViewportDims: number[] | null;
    maxCombinedTextureImageUnits: number | null;
    antialias: boolean | null;
  };
  gpuFamily: string;
};

function classifyGpu(renderer: string | null): string {
  if (!renderer) return "unknown";
  const r = renderer.toLowerCase();
  if (r.includes("adreno")) return "Adreno (Qualcomm)";
  if (r.includes("mali")) return "Mali (ARM)";
  if (r.includes("powervr") || r.includes("img")) return "PowerVR (Imagination)";
  if (r.includes("apple")) return "Apple";
  if (r.includes("nvidia") || r.includes("geforce")) return "NVIDIA";
  if (r.includes("intel")) return "Intel";
  if (r.includes("amd") || r.includes("radeon")) return "AMD";
  if (r.includes("swiftshader") || r.includes("llvmpipe") || r.includes("software"))
    return "Software (SwiftShader/llvmpipe)";
  if (r.includes("angle")) return "ANGLE (see renderer string for backend GPU)";
  return "other";
}

function collect(): Diag {
  const canvas = document.createElement("canvas");
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let contextType: "webgl2" | "webgl" | "none" = "none";

  const gl2 = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
  if (gl2) {
    gl = gl2;
    contextType = "webgl2";
  } else {
    const gl1 = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (gl1) {
      gl = gl1;
      contextType = "webgl";
    }
  }

  let vendor: string | null = null;
  let renderer: string | null = null;
  let unmaskedVendor: string | null = null;
  let unmaskedRenderer: string | null = null;
  let version: string | null = null;
  let shadingLanguageVersion: string | null = null;
  let maxTextureSize: number | null = null;
  let maxRenderbufferSize: number | null = null;
  let maxViewportDims: number[] | null = null;
  let maxCombinedTextureImageUnits: number | null = null;
  let antialias: boolean | null = null;

  if (gl) {
    try {
      vendor = gl.getParameter(gl.VENDOR) as string;
      renderer = gl.getParameter(gl.RENDERER) as string;
      version = gl.getParameter(gl.VERSION) as string;
      shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION) as string;
      maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
      maxViewportDims = Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array);
      maxCombinedTextureImageUnits = gl.getParameter(
        gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS,
      ) as number;
      const attrs = gl.getContextAttributes();
      antialias = attrs ? !!attrs.antialias : null;

      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        unmaskedVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string;
        unmaskedRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
      }
    } catch {
      /* ignore probe errors */
    }
  }

  const nav = navigator as Navigator & {
    userAgentData?: unknown;
    deviceMemory?: unknown;
  };

  return {
    collectedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    userAgentData: nav.userAgentData
      ? JSON.parse(JSON.stringify(nav.userAgentData))
      : null,
    platform: navigator.platform,
    deviceMemory: nav.deviceMemory ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    devicePixelRatio: window.devicePixelRatio,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
    },
    webgl: {
      contextType,
      vendor,
      renderer,
      unmaskedVendor,
      unmaskedRenderer,
      version,
      shadingLanguageVersion,
      maxTextureSize,
      maxRenderbufferSize,
      maxViewportDims,
      maxCombinedTextureImageUnits,
      antialias,
    },
    gpuFamily: classifyGpu(unmaskedRenderer || renderer),
  };
}

const mono: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "13px",
};

function Row({ label, value }: { label: string; value: unknown }) {
  const str =
    value === null || value === undefined
      ? "—"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        padding: "8px 0",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        ...mono,
      }}
    >
      <div style={{ flex: "0 0 42%", color: "#FFA52E", wordBreak: "break-word" }}>{label}</div>
      <div style={{ flex: 1, color: "#ffffff", wordBreak: "break-word" }}>{str}</div>
    </div>
  );
}

function GpuDiagnostics() {
  const [diag, setDiag] = useState<Diag | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDiag(collect());
  }, []);

  const json = diag ? JSON.stringify(diag, null, 2) : "";

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; user can still use the textarea below */
    }
  };

  const onDownload = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const rendererTag =
      diag?.webgl.unmaskedRenderer || diag?.webgl.renderer || "device";
    a.href = url;
    a.download = `gpu-diagnostics-${rendererTag.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const btn: CSSProperties = {
    height: "44px",
    padding: "0 18px",
    borderRadius: "9999px",
    border: "none",
    background: "linear-gradient(135deg, #FFA52E 0%, #FF6A00 100%)",
    color: "#000",
    fontWeight: 700,
    fontSize: "14px",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#000", padding: "16px", color: "#fff" }}>
      <h1 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 4px" }}>GPU / Driver Diagnostics</h1>
      <p style={{ ...mono, opacity: 0.7, margin: "0 0 16px" }}>
        Read-only WebGL probe. Open on each device, then Copy or Download the JSON and send it back.
      </p>

      {!diag ? (
        <div style={mono}>Collecting…</div>
      ) : (
        <>
          <div
            style={{
              background: "#111",
              border: "1px solid rgba(255,138,0,0.25)",
              borderRadius: "12px",
              padding: "10px 14px",
              marginBottom: "16px",
            }}
          >
            <div style={{ fontSize: "12px", opacity: 0.7, ...mono }}>Detected GPU family</div>
            <div style={{ fontSize: "18px", fontWeight: 800 }}>{diag.gpuFamily}</div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
            <button type="button" style={btn} onClick={onCopy}>
              {copied ? "Copied ✓" : "Copy JSON"}
            </button>
            <button type="button" style={btn} onClick={onDownload}>
              Download JSON
            </button>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <Row label="UNMASKED_RENDERER_WEBGL" value={diag.webgl.unmaskedRenderer} />
            <Row label="UNMASKED_VENDOR_WEBGL" value={diag.webgl.unmaskedVendor} />
            <Row label="RENDERER" value={diag.webgl.renderer} />
            <Row label="VENDOR" value={diag.webgl.vendor} />
            <Row label="WebGL context" value={diag.webgl.contextType} />
            <Row label="VERSION" value={diag.webgl.version} />
            <Row label="SHADING_LANGUAGE_VERSION" value={diag.webgl.shadingLanguageVersion} />
            <Row label="MAX_TEXTURE_SIZE" value={diag.webgl.maxTextureSize} />
            <Row label="MAX_RENDERBUFFER_SIZE" value={diag.webgl.maxRenderbufferSize} />
            <Row label="MAX_VIEWPORT_DIMS" value={diag.webgl.maxViewportDims} />
            <Row label="MAX_COMBINED_TEXTURE_IMAGE_UNITS" value={diag.webgl.maxCombinedTextureImageUnits} />
            <Row label="antialias" value={diag.webgl.antialias} />
            <Row label="devicePixelRatio" value={diag.devicePixelRatio} />
            <Row label="deviceMemory (GB)" value={diag.deviceMemory} />
            <Row label="hardwareConcurrency" value={diag.hardwareConcurrency} />
            <Row label="screen" value={diag.screen} />
            <Row label="platform" value={diag.platform} />
            <Row label="userAgent" value={diag.userAgent} />
            <Row label="userAgentData" value={diag.userAgentData} />
          </div>

          <div style={{ ...mono, fontSize: "12px", opacity: 0.7, marginBottom: "6px" }}>
            Full JSON (select all to copy manually if the button is blocked):
          </div>
          <textarea
            readOnly
            value={json}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: "100%",
              height: "260px",
              background: "#0a0a0a",
              color: "#9ef",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "10px",
              padding: "10px",
              ...mono,
              fontSize: "11px",
            }}
          />
        </>
      )}
    </div>
  );
}
