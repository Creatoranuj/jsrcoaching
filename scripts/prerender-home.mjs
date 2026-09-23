// Post-build: inject a static snapshot of the home page into dist/index.html.
// main.tsx still uses createRoot (no hydration), which replaces the snapshot on
// mount; an inline guard drops it on non-home paths and inside the native app.
import { createServer } from "vite";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const DIST = "dist";
const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
let html;
try {
  const { renderHome } = await server.ssrLoadModule("/src/prerender/home-entry.tsx");
  html = renderHome();
} catch (e) {
  console.warn("[prerender-home] skipped:", e?.message || e);
  await server.close();
  process.exit(0); // never fail the build; app still works without the snapshot
}
await server.close();

// Map dev asset URLs (/src/assets/foo.webp) to hashed dist files.
const assets = readdirSync(`${DIST}/assets`);
html = html.replace(/\/src\/assets\/([\w.-]+?)\.(\w+)(\?[^"]*)?/g, (m, name, ext) => {
  const hit = assets.find((f) => f.startsWith(`${name}-`) && f.endsWith(`.${ext}`));
  return hit ? `/assets/${hit}` : m;
});

const guard = `<script>(function(){var r=document.getElementById('root');var n=window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform();if(r&&(location.pathname!=='/'||n)){r.innerHTML='';r.removeAttribute('data-prerendered');}})();</script>`;
const file = `${DIST}/index.html`;
const src = readFileSync(file, "utf8");
if (!src.includes('<div id="root"></div>')) { console.warn("[prerender-home] #root not empty, skipped"); process.exit(0); }
writeFileSync(file, src.replace('<div id="root"></div>', `<div id="root" data-prerendered="home">${html}</div>${guard}`));
console.log(`[prerender-home] injected ${(html.length / 1024).toFixed(1)} KB into ${file}`);
