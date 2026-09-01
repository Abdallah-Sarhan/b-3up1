import { QueryClient } from "@tanstack/react-query";
import { createHashHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  // Electron loads the app from a custom scheme (app://) or file://, where
  // path-based history produces URLs that cannot be resolved on reload;
  // use hash history there and normal history in the browser preview.
  const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
  const needsHashHistory = protocol !== "http:" && protocol !== "https:";

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(needsHashHistory ? { history: createHashHistory() } : {}),
  });


  return router;
};
