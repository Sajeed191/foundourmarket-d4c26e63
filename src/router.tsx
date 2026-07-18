import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Perf: 40ms was firing on every hover, spamming Supabase from grids and
    // burning main-thread on incidental cursor moves. 150ms filters out
    // accidental hovers while still feeling instant on deliberate intent.
    defaultPreloadDelay: 150,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
