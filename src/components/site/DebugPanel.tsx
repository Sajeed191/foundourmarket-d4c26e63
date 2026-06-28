import { useEffect, useState } from "react";
import {
  DEBUG_FLAGS,
  FLAG_LABELS,
  getAllFlags,
  isDebugEnabled,
  resetFlags,
  setAll,
  setFlag,
  subscribe,
  type DebugFlag,
} from "@/lib/debug-flags";
import {
  getDiagnostics,
  subscribeDiagnostics,
  type Diagnostics,
} from "@/lib/debug-diagnostics";

/**
 * TEMPORARY floating debug panel for binary isolation of the Android rendering
 * corruption. Visible only when the harness is enabled (?debug=1 once, then it
 * persists). Remove this component + debug-flags + debug-diagnostics when the
 * root cause is fixed.
 */
export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [flags, setFlags] = useState(() => getAllFlags());
  const [diag, setDiag] = useState<Diagnostics>(() => getDiagnostics());

  useEffect(() => {
    setShown(isDebugEnabled());
    const unFlags = subscribe(() => {
      setFlags(getAllFlags());
      setShown(isDebugEnabled());
    });
    const unDiag = subscribeDiagnostics(() => setDiag(getDiagnostics()));
    return () => {
      unFlags();
      unDiag();
    };
  }, []);

  if (!shown) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 2147483647,
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        color: "#fff",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "#111",
          border: "1px solid #f97316",
          color: "#f97316",
          borderRadius: 8,
          padding: "8px 12px",
          fontWeight: 700,
        }}
      >
        {open ? "× DEBUG" : "⚙ DEBUG"} · {diag.fps}fps · {diag.glContextLost} ctxlost
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            width: 280,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "#0b0b0b",
            border: "1px solid #333",
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={() => setAll(true)} style={btn}>
              All ON
            </button>
            <button type="button" onClick={() => setAll(false)} style={btn}>
              All OFF
            </button>
            <button type="button" onClick={() => resetFlags()} style={btn}>
              Reset
            </button>
          </div>

          {DEBUG_FLAGS.map((f: DebugFlag) => (
            <label
              key={f}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 0",
                borderBottom: "1px solid #1c1c1c",
              }}
            >
              <span>{FLAG_LABELS[f]}</span>
              <input
                type="checkbox"
                checked={flags[f]}
                onChange={(e) => setFlag(f, e.target.checked)}
              />
            </label>
          ))}

          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid #333",
              lineHeight: 1.5,
            }}
          >
            <Row k="GPU" v={diag.gpuRenderer} />
            <Row k="GPU vendor" v={diag.gpuVendor} />
            <Row k="WebGL" v={diag.webglSupported ? "yes" : "NO"} />
            <Row k="Device RAM" v={diag.deviceMemoryGb ? `${diag.deviceMemoryGb}GB` : "?"} />
            <Row k="Cores" v={String(diag.hardwareConcurrency ?? "?")} />
            <Row
              k="JS heap"
              v={diag.jsHeapUsedMb != null ? `${diag.jsHeapUsedMb}/${diag.jsHeapLimitMb}MB` : "n/a"}
            />
            <Row k="Compositor layers" v={String(diag.compositorLayers)} />
            <Row k="FPS" v={String(diag.fps)} />
            <Row k="Long tasks" v={`${diag.longTasks} (max ${Math.round(diag.longTaskMaxMs)}ms)`} />
            <Row k="Img decode fails" v={String(diag.imageDecodeFailures)} />
            <Row k="Canvas fails" v={String(diag.canvasFailures)} />
            <Row k="GL context lost" v={String(diag.glContextLost)} />
            <Row k="React remounts" v={String(diag.reactRemounts)} />
            <Row k="Unexpected rerenders" v={String(diag.unexpectedRerenders)} />
            <Row k="Hydration mismatch" v={String(diag.hydrationMismatches)} />
          </div>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  flex: 1,
  background: "#1a1a1a",
  border: "1px solid #444",
  color: "#fff",
  borderRadius: 6,
  padding: "4px 0",
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "#888" }}>{k}</span>
      <span style={{ textAlign: "right", wordBreak: "break-word", maxWidth: 160 }}>{v}</span>
    </div>
  );
}
