import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { createQueryClient } from "./queryClient";

/**
 * Everything the app needs above its views.
 *
 * One provider today — the query cache — and the place the next one belongs, so that the views never
 * learn how server state is fetched. The client is created once per mount through `useState`'s lazy
 * initialiser: a fresh cache for each app instance, and the same one for every render of it.
 */
export function AppProviders({ children }: { readonly children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
