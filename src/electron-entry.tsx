import "@/styles.css";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "@/router";

// Standalone entry for the Electron build. CSS is emitted once as a normal
// local stylesheet; keeping an 80 KB style string out of React avoids a large
// synchronous DOM update while Windows is activating its text-input service.
const router = getRouter();
const root = document.getElementById("root");

if (!root) throw new Error("Ward 39 root element was not found");

window.addEventListener("error", (event) => {
  window.ward39Desktop?.reportError(`renderer error: ${event.message}`);
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  window.ward39Desktop?.reportError(`unhandled rejection: ${reason}`);
});

// Lightweight liveness signal: if the window ever stops painting frames the
// desktop shell notices and recovers instead of staying frozen.
if (window.ward39Desktop) {
  const beat = () => {
    window.ward39Desktop?.heartbeat();
    setTimeout(() => requestAnimationFrame(beat), 3000);
  };
  requestAnimationFrame(beat);
}

createRoot(root).render(<RouterProvider router={router} />);

