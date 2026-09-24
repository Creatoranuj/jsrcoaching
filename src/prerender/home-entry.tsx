// Build-time only: renders the public home page to static HTML so the first
// paint (text + hero photo) happens before any JS runs. Never imported by the app.
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthContext } from "@/contexts/AuthContext";
import Index from "@/pages/Index";

export function renderHome(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  // Signed-out snapshot; the live app replaces it on mount.
  const auth = new Proxy({ user: null, profile: null, isLoading: false, loading: false, role: null } as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : () => undefined),
  });
  return renderToString(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={auth as never}>
        <MemoryRouter initialEntries={["/"]}>
          <Index />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
