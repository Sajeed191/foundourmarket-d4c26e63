import { useEffect, useState } from "react";
import {
  BISECT_TESTS,
  DEBUG_FLAGS,
  FLAG_LABELS,
  clearBisectLog,
  downloadBisectReport,
  evaluateBisect,
  getActiveBisectTest,
  getAllFlags,
  getBisectOverrideEnabled,
  getBisectLog,
  RUNNER_STEPS,
  getRunnerState,
  isDebugEnabled,
  recordBisectObservation,
  recordRunnerResult,
  resetFlags,
  setActiveBisectTest,
  setBisectOverrideEnabled,
  setAll,
  setFlag,
  startRunner,
  stopRunner,
  subscribe,
  type BisectObservation,
  type BisectPhase,
  type DebugFlag,
  type RunnerState,
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
  const [activeBisect, setActiveBisectState] = useState<string | null>(() => getActiveBisectTest());
  const [bisectOverride, setBisectOverrideState] = useState(() => getBisectOverrideEnabled());
  const [bisectLog, setBisectLog] = useState<BisectObservation[]>(() => getBisectLog());
  const [runner, setRunner] = useState<RunnerState>(() => getRunnerState());

  useEffect(() => {
    setShown(isDebugEnabled());
    const unFlags = subscribe(() => {
      setFlags(getAllFlags());
      setShown(isDebugEnabled());
      setActiveBisectState(getActiveBisectTest());
      setBisectOverrideState(getBisectOverrideEnabled());
      setBisectLog(getBisectLog());
      setRunner(getRunnerState());
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
          <GuidedRunner runner={runner} diag={diag} />


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
            }}
          >
            <div style={{ color: "#f97316", fontWeight: 800, marginBottom: 6 }}>
              Realme A/B bisect — one property only
            </div>
            <select
              value={activeBisect ?? ""}
              onChange={(e) => setActiveBisectTest(e.target.value || null)}
              style={{
                width: "100%",
                background: "#111",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: 6,
                padding: 6,
                marginBottom: 6,
              }}
            >
              <option value="">No single-property override</option>
              {BISECT_TESTS.map((test) => (
                <option key={test.id} value={test.id}>
                  {test.property} · {test.component}
                </option>
              ))}
            </select>
            {activeBisect && (
              <BisectRecorder activeId={activeBisect} overrideEnabled={bisectOverride} log={bisectLog} />
            )}
            <Verdict log={bisectLog} />
            <button type="button" onClick={() => downloadBisectReport(diag)} style={{ ...btn, width: "100%", marginTop: 6, background: "#f97316", color: "#111", fontWeight: 800 }}>
              ⬇ Download JSON report
            </button>
            <button type="button" onClick={() => clearBisectLog()} style={{ ...btn, width: "100%", marginTop: 6 }}>
              Clear bisect log
            </button>
          </div>


          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid #333",
              lineHeight: 1.5,
            }}
          >
            <Row k="Device model" v={diag.deviceModel} />
            <Row k="Android" v={diag.androidVersion} />
            <Row k="Chrome" v={diag.chromeVersion} />
            <Row k="GPU" v={diag.gpuRenderer} />
            <Row k="GPU vendor" v={diag.gpuVendor} />
            <Row k="WebGL" v={diag.webglSupported ? "yes" : "NO"} />
            <Row k="Device RAM" v={diag.deviceMemoryGb ? `${diag.deviceMemoryGb}GB` : "?"} />
            <Row k="Cores" v={String(diag.hardwareConcurrency ?? "?")} />
            <Row
              k="JS heap"
              v={diag.jsHeapUsedMb != null ? `${diag.jsHeapUsedMb}/${diag.jsHeapLimitMb}MB` : "n/a"}
            />
            <Row k="DOM nodes" v={String(diag.domNodeCount)} />
            <Row k="Product cards" v={String(diag.productCardCount)} />
            <Row k="Images" v={`${diag.decodedImageCount}/${diag.imageCount} decoded`} />
            <Row k="Compositor layers" v={String(diag.compositorLayers)} />
            <Row k="Paint entries" v={String(diag.paintCount)} />
            <Row k="Layout shifts" v={String(diag.layoutShiftCount)} />
            <Row k="FPS" v={String(diag.fps)} />
            <Row k="Long tasks" v={`${diag.longTasks} (max ${Math.round(diag.longTaskMaxMs)}ms)`} />
            <Row k="Img decode fails" v={String(diag.imageDecodeFailures)} />
            <Row k="createImageBitmap fails" v={String(diag.createImageBitmapFailures)} />
            <Row k="Canvas fails" v={String(diag.canvasFailures)} />
            <Row k="GL context lost" v={String(diag.glContextLost)} />
            <Row k="GL context restored" v={String(diag.glContextRestored)} />
            <Row k="React remounts" v={String(diag.reactRemounts)} />
            <Row k="Unexpected rerenders" v={String(diag.unexpectedRerenders)} />
            <Row k="Hydration mismatch" v={String(diag.hydrationMismatches)} />

          </div>
        </div>
      )}
    </div>
  );
}

function BisectRecorder({ activeId, overrideEnabled, log }: { activeId: string; overrideEnabled: boolean; log: BisectObservation[] }) {
  const test = BISECT_TESTS.find((t) => t.id === activeId);
  if (!test) return null;
  const rows = log.filter((item) => item.id === activeId).slice(-3);
  return (
    <div style={{ border: "1px solid #222", borderRadius: 8, padding: 8, lineHeight: 1.35 }}>
      <Row k="property" v={test.property} />
      <Row k="component" v={test.component} />
      <Row k="file" v={test.file} />
      <Row k="line" v={String(test.line)} />
      <Row k="enabled" v={test.enabledValue} />
      <Row k="disabled" v={test.disabledValue} />
      <label style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
        <span>{overrideEnabled ? "Feature OFF for selected property" : "Feature ON / production value"}</span>
        <input
          type="checkbox"
          checked={overrideEnabled}
          onChange={(e) => setBisectOverrideEnabled(e.target.checked)}
        />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
        <RecordButton id={activeId} phase="feature-on-before" corruption={true} label="1 ON: corrupt" />
        <RecordButton id={activeId} phase="feature-on-before" corruption={false} label="1 ON: clean" />
        <RecordButton id={activeId} phase="feature-off-after" corruption={true} label="2 OFF: corrupt" />
        <RecordButton id={activeId} phase="feature-off-after" corruption={false} label="2 OFF: clean" />
        <RecordButton id={activeId} phase="feature-on-return" corruption={true} label="3 ON again: corrupt" />
        <RecordButton id={activeId} phase="feature-on-return" corruption={false} label="3 ON again: clean" />
      </div>
      <div style={{ marginTop: 8, color: "#aaa" }}>
        Attach Realme phone photos separately: before, after, return.
      </div>
      {rows.map((row) => (
        <div key={`${row.phase}:${row.at}`} style={{ fontSize: 11, color: row.corruption ? "#ff8a8a" : "#8affb1" }}>
          {row.phase}: corruption {row.corruption ? "YES" : "NO"}
        </div>
      ))}
    </div>
  );
}

function RecordButton({ id, phase, corruption, label }: { id: string; phase: BisectPhase; corruption: boolean; label: string }) {
  return (
    <button type="button" onClick={() => recordBisectObservation(id, phase, corruption)} style={btn}>
      {label}
    </button>
  );
}

function phaseLabel(phase: BisectPhase): string {
  if (phase === "feature-on-before") return "Phase 1 — feature ON";
  if (phase === "feature-off-after") return "Phase 2 — feature OFF";
  return "Phase 3 — feature ON again";
}

function GuidedRunner({ runner, diag }: { runner: RunnerState; diag: Diagnostics }) {
  const { active, index, phase, step, confirmed, finished } = runner;

  if (confirmed) {
    const primary = confirmed.features[0];
    const test = primary.kind === "bisect" ? BISECT_TESTS.find((t) => t.id === primary.id) : null;
    return (
      <div style={{ marginBottom: 10, border: "1px solid #2a5", borderRadius: 8, padding: 10, background: "#08160c" }}>
        <div style={{ color: "#8affb1", fontWeight: 800, marginBottom: 4 }}>✅ CONFIRMED CULPRIT</div>
        <div style={{ color: "#fff" }}>{confirmed.label}</div>
        {test && (
          <div style={{ fontSize: 11, color: "#cbe", marginTop: 4, lineHeight: 1.4 }}>
            {test.property} · {test.component}
            <br />
            {test.file}:{test.line}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#9ad", marginTop: 6 }}>
          Testing stopped automatically. Download the report, then I’ll apply the minimal fix.
        </div>
        <button type="button" onClick={() => downloadBisectReport(diag)} style={{ ...btn, width: "100%", marginTop: 8, background: "#f97316", color: "#111", fontWeight: 800 }}>
          ⬇ Download JSON report
        </button>
        <button type="button" onClick={() => stopRunner()} style={{ ...btn, width: "100%", marginTop: 6 }}>
          End runner
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <div style={{ marginBottom: 10, border: "1px solid #a52", borderRadius: 8, padding: 10, background: "#160c08" }}>
        <div style={{ color: "#ffcf8a", fontWeight: 800, marginBottom: 4 }}>
          No single or two-feature culprit reproduced A/B/A
        </div>
        <div style={{ fontSize: 11, color: "#cba", lineHeight: 1.4 }}>
          Every priority feature and combination was tested. Download the report so we can decide next steps.
        </div>
        <button type="button" onClick={() => downloadBisectReport(diag)} style={{ ...btn, width: "100%", marginTop: 8, background: "#f97316", color: "#111", fontWeight: 800 }}>
          ⬇ Download JSON report
        </button>
        <button type="button" onClick={() => startRunner()} style={{ ...btn, width: "100%", marginTop: 6 }}>
          Restart runner
        </button>
      </div>
    );
  }

  if (!active) {
    return (
      <div style={{ marginBottom: 10, border: "1px solid #f97316", borderRadius: 8, padding: 10 }}>
        <div style={{ color: "#f97316", fontWeight: 800, marginBottom: 4 }}>Guided culprit hunt</div>
        <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.4 }}>
          Tests the 19 highest-probability causes in priority order, one feature at a time
          (ON → OFF → ON). Auto-skips on failure, auto-stops on the first confirmed culprit,
          then falls back to two-feature combos.
        </div>
        <button type="button" onClick={() => startRunner()} style={{ ...btn, width: "100%", marginTop: 8, background: "#f97316", color: "#111", fontWeight: 800 }}>
          ▶ Start guided runner
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 10, border: "1px solid #f97316", borderRadius: 8, padding: 10 }}>
      <div style={{ color: "#f97316", fontWeight: 800, marginBottom: 2 }}>
        Guided runner · {index + 1}/{RUNNER_STEPS.length}
      </div>
      <div style={{ color: "#fff", fontWeight: 700 }}>{step?.label}</div>
      {step?.combo && (
        <div style={{ fontSize: 11, color: "#ffcf8a" }}>two-feature combination</div>
      )}
      <div style={{ fontSize: 12, color: "#9ad", margin: "6px 0" }}>{phaseLabel(phase)}</div>
      <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6, lineHeight: 1.35 }}>
        Look at the Realme screen now. Is the corruption visible in this state?
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => recordRunnerResult(true)}
          style={{ ...btn, background: "#3a1010", border: "1px solid #a33", color: "#ff9a9a" }}
        >
          Corruption: YES
        </button>
        <button
          type="button"
          onClick={() => recordRunnerResult(false)}
          style={{ ...btn, background: "#0e2a16", border: "1px solid #2a5", color: "#8affb1" }}
        >
          Corruption: NO
        </button>
      </div>
      <button type="button" onClick={() => stopRunner()} style={{ ...btn, width: "100%", marginTop: 6 }}>
        Stop runner
      </button>
    </div>
  );
}


function Verdict({ log }: { log: BisectObservation[] }) {
  // Re-evaluate against the live log so the verdict updates as you record.
  void log;

  const confirmed = evaluateBisect().filter((e) => e.confirmedRootCause);
  if (confirmed.length === 0) {
    return (
      <div style={{ marginTop: 8, fontSize: 11, color: "#aaa" }}>
        Root cause: not yet proven. Need ON=corrupt → OFF=clean → ON=corrupt for exactly one property.
      </div>
    );
  }
  if (confirmed.length > 1) {
    return (
      <div style={{ marginTop: 8, fontSize: 11, color: "#ffcf8a" }}>
        {confirmed.length} candidates pass A/B/A — re-test one at a time; only one may be the cause.
      </div>
    );
  }
  const c = confirmed[0];
  return (
    <div style={{ marginTop: 8, fontSize: 11, color: "#8affb1", border: "1px solid #2a5", borderRadius: 6, padding: 6 }}>
      ✅ CONFIRMED ROOT CAUSE: {c.property} on {c.component} ({c.file}:{c.line})
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
