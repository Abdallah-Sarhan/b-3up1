import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "@/router";

// Standalone entry for the Electron build. CSS is emitted once as a normal
// local stylesheet; keeping an 80 KB style string out of React avoids a large
// synchronous DOM update while Windows is activating its text-input service.
const router = getRouter();
const root = document.getElementById("root");

if (!root) throw new Error("Ward 39 root element was not found");

createRoot(root).render(<RouterProvider router={router} />);
