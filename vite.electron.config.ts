// Separate SPA build config for the Electron desktop package.
// The main vite.config.ts builds the SSR/web app; this one bundles the same
// routes as a static single-page app that works from file:// (fully offline).
import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import tsConfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [
    // The web root route imports styles.css?url for SSR head links; in the
    // desktop SPA that would emit a dead file:// stylesheet link, so stub it.
    {
      name: "strip-css-url-import",
      resolveId(id) {
        if (id.includes("styles.css?url")) return "\0empty-css-url";
      },
      load(id) {
        if (id === "\0empty-css-url") return 'export default "data:text/css,"';
      },
    },
    tsConfigPaths(),
    tailwindcss(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    // Chromium refuses external ES-module JS over file://, but plain CSS
    // files load fine — so inline only the JS, keep CSS as a linked file.
    viteSingleFile({ inlinePattern: ["**/*.js"] }),
  ],
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      input: path.resolve(__dirname, "electron.html"),
      output: { inlineDynamicImports: true },
    },
  },
});
