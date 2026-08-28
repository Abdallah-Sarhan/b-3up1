import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "@/router";
import { electronCss } from "@/electron-css";

// Standalone entry for the Electron build (loads dist-electron/index.html
// over the file:// protocol, so SSR/nitro entries cannot be used).
//
// Tailwind CSS is embedded as a string and rendered through React, because
// external stylesheets are stripped by the single-file build and plain
// <style> tags injected into the HTML get removed at runtime.
const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <>
    <style>{electronCss}</style>
    <RouterProvider router={router} />
  </>,
);
