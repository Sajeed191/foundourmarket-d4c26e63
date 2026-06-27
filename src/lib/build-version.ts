// Build identifier injected by Vite at build time (see vite.config.ts `define`).
// Changes on every deployment, so it can be used to verify which build a device
// is actually running (mobile vs desktop stale-cache debugging).
declare const __BUILD_ID__: string;

export const BUILD_ID: string =
  typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

let logged = false;

/** Logs the build version once to the console so mobile devices can be verified. */
export function logBuildVersion() {
  if (logged || typeof console === "undefined") return;
  logged = true;
  // eslint-disable-next-line no-console
  console.info(`%cFoundOurMarket build ${BUILD_ID}`, "color:#f59e0b;font-weight:bold");
}
