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
    // Server-only routes (MCP, OAuth metadata, the streaming chat endpoint) and
    // the cloud chat server functions cannot be bundled into an offline SPA —
    // they pull in TanStack Start's server entry and blow up the build, which is
    // what left the packaged desktop app on a blank white window. Replace them
    // with inert client-safe stubs; the desktop build has no server anyway.
    {
      name: "electron-stub-server-routes",
      enforce: "pre" as const,
      load(id: string) {
        const file = id.split("?")[0] ?? "";
        const routeStub = (routePath: string) =>
          `import { createFileRoute } from "@tanstack/react-router";\n` +
          `export const Route = createFileRoute(${JSON.stringify(routePath)})({});\n`;
        if (file.endsWith("src/routes/api/chat.ts")) return routeStub("/api/chat");
        if (file.endsWith("src/routes/mcp.ts")) return routeStub("/mcp");
        if (file.endsWith("oauth-protected-resource.ts"))
          return routeStub("/.well-known/oauth-protected-resource");
        if (file.endsWith("src/lib/chat.functions.ts")) {
          const offline = `() => { throw new Error("المساعد الذكي يحتاج اتصالاً بالإنترنت"); }`;
          return (
            `export const listThreads = async () => [];\n` +
            `export const getThreadMessages = async () => [];\n` +
            `export const createThread = ${offline};\n` +
            `export const deleteThread = ${offline};\n`
          );
        }
        return null;
      },
    },
    tsConfigPaths(),
    tailwindcss(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
  ],
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      input: path.resolve(__dirname, "electron.html"),
    },
  },
});
