// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { imagetools } from "vite-imagetools";
import { visualizer } from "rollup-plugin-visualizer";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Force every `entities` import (incl. deep paths used by @react-email/components
  // via htmlparser2) to the v4.5.0 copy at the project root. Package managers hoist
  // nested entities v6/v7 copies that removed `./lib/decode.js`, which makes
  // @react-email's `render()` throw at runtime in the Cloudflare Worker — silently
  // breaking ALL transactional email rendering. See email troubleshooting guide.
  vite: {
    // Unique build identifier injected at build time so every deployment has a
    // distinct, verifiable version string (footer + console). Lets us confirm a
    // device is actually running the newest deployment.
    define: {
      __BUILD_ID__: JSON.stringify(
        new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12),
      ),
    },
    plugins: [
      // Build-time responsive image generation (WebP + multiple widths).
      // Enabled for imports that opt in via the `?responsive` query flag.
      imagetools(),
      // Phase 2 (Build Observability): emits dist/build-report.html with a
      // treemap of every chunk + its modules. Pure observability — the
      // plugin does not touch the shipped bundle. `emitFile: false` keeps
      // the report out of the client asset manifest so it is not shipped
      // to end users; it is written directly to dist/.
      visualizer({
        filename: "dist/build-report.html",
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
        emitFile: false,
      }),
    ],
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
        entities: path.resolve(__dirname, "node_modules/entities"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Keep framer-motion out of the shared entry chunk. It is imported by
          // many route/lazy chunks, so Rollup would otherwise hoist it into the
          // always-loaded entry. Isolating it means only motion-using routes
          // fetch it (in parallel, and cached across navigations).
          manualChunks(id) {
            if (id.includes("node_modules/framer-motion")) {
              return "framer-motion";
            }
          },
        },
      },
    },
  },
});
