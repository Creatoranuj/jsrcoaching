// Minimal SSR shim so the Lovable preview / Cloudflare Worker runtime can
// serve this Vite + React SPA. The real app boots client-side from
// /src/main.tsx via index.html — this handler just returns that shell.

// Inline shell so this file has zero runtime dependencies. If the file
// loading fails, the platform's error overlay would block everything.
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <link rel="icon" type="image/png" href="/icons/icon-192x192.png" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
    <meta name="theme-color" content="#284b85" />
    <title>JSR COACHING — Roz ka English practice</title>
    <meta name="description" content="JSR COACHING — live classes, lessons aur doubts ek app me." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

export default {
  async fetch(_request: Request, _env: unknown, _ctx: unknown): Promise<Response> {
    return new Response(INDEX_HTML, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};