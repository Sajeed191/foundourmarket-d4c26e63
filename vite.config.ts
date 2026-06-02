// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { imagetools } from "vite-imagetools";

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
    plugins: [
      // Build-time responsive image generation (WebP + multiple widths).
      // Enabled for imports that opt in via the `?responsive` query flag.
      imagetools(),
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
          manualChunks: {
            "framer-motion": ["framer-motion"],
          },
        },
      },
    },
  },
});
