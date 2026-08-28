import { QueryClient } from "@tanstack/react-query";
import { createHashHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  // Electron loads the app over file:// where path-based history breaks;
  // use hash history there and normal history in the browser preview.
  const isFileProtocol =
    typeof window !== "undefined" && window.location.protocol === "file:";

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(isFileProtocol ? { history: createHashHistory() } : {}),
  });

  return router;
};
