import { createFileRoute } from "@tanstack/react-router";
import type { CSSProperties } from "react";

export const Route = createFileRoute("/chromium-render-test")({
  component: ChromiumRenderTest,
});

/* ============================================================================
 * CHROMIUM 149 GPU-RASTER CORRUPTION — ISOLATED REPRODUCTION
 * ----------------------------------------------------------------------------
 * This page is a DIAGNOSTIC HARNESS only. It imports NO application code:
 * no ProductCard, no AdaptiveProductMedia, no hooks, no analytics, no portals.
 * Pure HTML/CSS/React.
 *
 * HOW TO USE
 *   Flip exactly ONE flag at a time (leave the rest as-is), reload on a
 *   Chrome 149 device, scroll to the bottom, then scroll back up and look for
 *   corruption (torn tiles, ghosting, smeared rounded corners).
 *
 *   Start with ALL flags false  -> baseline (must be clean).
 *   Then enable features one at a time to find the smallest reproducer.
 *
 *   The single most important pair is:
 *     ENABLE_OVERFLOW_HIDDEN + ENABLE_BORDER_RADIUS
 *   Together they form the rounded-rect clip that Chromium lowers to
 *   MaskFilterInfo on the SharedQuadState (the suspected 149 defect). Every
 *   other flag is a control to rule its compositor path in or out.
 * ========================================================================== */

// -------- FEATURE FLAGS: flip ONE at a time --------
const ENABLE_GRID = true;             // CSS grid layout (vs. single column)
const ENABLE_BORDER_RADIUS = false;   // rounded corners on the card shell
const ENABLE_OVERFLOW_HIDDEN = false; // overflow:hidden clip on the card shell
const ENABLE_BOX_SHADOW = false;      // drop shadow on the card shell
const ENABLE_IMAGES = false;          // render <img> (real decodes) vs. flat div
const ENABLE_OPACITY_FADE = false;    // opacity transition on image load
const ENABLE_LAZY_LOADING = false;    // loading="lazy" on <img>
const ENABLE_POSITION_RELATIVE = false; // position:relative on card + media
const ENABLE_TRANSITIONS = false;     // CSS transitions on the card shell
// ---------------------------------------------------

const CARD_COUNT = 12;

// Remote images with unique URLs so each card triggers its own decode.
// picsum gives stable, cache-bustable images without any app dependency.
function imageFor(i: number): string {
  return `https://picsum.photos/seed/chromium-${i}/600/750`;
}

function Card({ index }: { index: number }) {
  const shellStyle: CSSProperties = {
    backgroundColor: "#111111",
    border: "1px solid rgba(255,138,0,0.18)",
    display: "flex",
    flexDirection: "column",
    ...(ENABLE_POSITION_RELATIVE ? { position: "relative" } : null),
    ...(ENABLE_BORDER_RADIUS ? { borderRadius: "22px" } : null),
    ...(ENABLE_OVERFLOW_HIDDEN ? { overflow: "hidden" } : null),
    ...(ENABLE_BOX_SHADOW ? { boxShadow: "0 8px 24px rgba(0,0,0,0.35)" } : null),
    ...(ENABLE_TRANSITIONS
      ? { transition: "box-shadow 200ms, border-color 200ms, transform 200ms" }
      : null),
  };

  const mediaStyle: CSSProperties = {
    width: "100%",
    aspectRatio: "4 / 5",
    backgroundColor: "#1c1c1c",
    display: "block",
    ...(ENABLE_POSITION_RELATIVE ? { position: "relative" } : null),
    ...(ENABLE_OPACITY_FADE ? { opacity: 1, transition: "opacity 300ms ease" } : null),
    objectFit: "cover" as const,
  };

  return (
    <article style={shellStyle}>
      {ENABLE_IMAGES ? (
        <img
          src={imageFor(index)}
          alt=""
          width={600}
          height={750}
          {...(ENABLE_LAZY_LOADING ? { loading: "lazy" as const } : null)}
          style={mediaStyle}
        />
      ) : (
        <div style={mediaStyle} />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
        <h3
          style={{
            margin: 0,
            fontSize: "16px",
            fontWeight: 700,
            lineHeight: 1.3,
            color: "#ffffff",
          }}
        >
          Product Title {index + 1}
        </h3>
        <div style={{ fontSize: "30px", fontWeight: 800, color: "#ffffff", lineHeight: 1 }}>
          $199
        </div>
        <button
          type="button"
          style={{
            marginTop: "8px",
            height: "52px",
            width: "100%",
            border: "none",
            borderRadius: "9999px",
            background: "linear-gradient(135deg, #FFA52E 0%, #FF6A00 100%)",
            color: "#000000",
            fontSize: "16px",
            fontWeight: 700,
          }}
        >
          Buy Now
        </button>
      </div>
    </article>
  );
}

function ChromiumRenderTest() {
  const containerStyle: CSSProperties = ENABLE_GRID
    ? { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }
    : { display: "flex", flexDirection: "column", gap: "12px" };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#000000", padding: "16px" }}>
      <header style={{ color: "#ffffff", marginBottom: "16px", fontFamily: "monospace" }}>
        <div style={{ fontSize: "18px", fontWeight: 700 }}>Chromium 149 render test</div>
        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: 4 }}>
          grid:{String(ENABLE_GRID)} radius:{String(ENABLE_BORDER_RADIUS)} overflow:
          {String(ENABLE_OVERFLOW_HIDDEN)} shadow:{String(ENABLE_BOX_SHADOW)} img:
          {String(ENABLE_IMAGES)} fade:{String(ENABLE_OPACITY_FADE)} lazy:
          {String(ENABLE_LAZY_LOADING)} pos:{String(ENABLE_POSITION_RELATIVE)} trans:
          {String(ENABLE_TRANSITIONS)}
        </div>
        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: 4 }}>
          Scroll to the bottom, then back up. Look for torn/smeared tiles.
        </div>
      </header>

      <div style={containerStyle}>
        {Array.from({ length: CARD_COUNT }, (_, i) => (
          <Card key={i} index={i} />
        ))}
      </div>

      {/* Extra scroll runway so the compositor must recycle raster tiles. */}
      <div style={{ height: "150vh" }} />
    </div>
  );
}
