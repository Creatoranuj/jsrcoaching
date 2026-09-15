# capacitor-plugin-nb-pdf

Never-Fail PDF delivery for Capacitor apps. Ships as a first-party plugin under `capacitor-plugin-nb-pdf/`.

## Why this exists

The web `pdf.js` fetch path breaks on flaky 3G/4G:
- WebView `fetch()` has no resume (no HTTP Range)
- No retry on 5xx / socket-hang
- Cache is browser-cache-policy dependent → cleared unpredictably
- Silent spinner if the network stalls

This plugin fixes all four by:
1. **Native download** using OkHttp (Android) / URLSession (iOS)
2. **HTTP Range resume** — partial `.part` file survives process death
3. **Exponential backoff** — 400ms → 800ms → 1.6s → 3.2s
4. **LRU disk cache** capped at 512 MB, age-aware eviction
5. **`pdfProgress` events** every 1% so UI shows a real number, not a silent spinner
6. **Stale-cache fallback** — if the network fully fails but we have any prior copy, we serve it. **Never-Fail contract.**

## Usage from React

```ts
import { NbPdf } from 'capacitor-plugin-nb-pdf';

const handle = await NbPdf.addListener('pdfProgress', (ev) => {
  window.dispatchEvent(new CustomEvent('pdf-progress', { detail: ev.percent }));
});

const { localUri, fromCache } = await NbPdf.fetchPdf({
  url: driveDirectUrl,
  cacheKey: `lesson:${lessonId}:main-pdf`,
  maxAgeSec: 7 * 24 * 3600,
});

setPdfSource(localUri);  // hand to react-pdf or <object data={localUri}>
handle.remove();
```

## Wiring into the existing app

`src/components/video/FastPdfReader.tsx` currently receives a remote URL and feeds it directly to `pdf.js`. Replace that with a small hook:

```ts
export function useDurablePdf(url: string, cacheKey: string) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    NbPdf.fetchPdf({ url, cacheKey }).then((r) => setSrc(r.localUri));
  }, [url, cacheKey]);
  return src;
}
```

Progress events flow into `ReaderProgress.tsx`, which already listens for `pdf-progress` — no UI change required.

## Install

```bash
npm i ./capacitor-plugin-nb-pdf
npx cap sync
```

## Status

- ✅ Android (Kotlin, OkHttp) — implements full contract
- ✅ iOS (Swift, URLSession) — implements full contract (Range resume via `.part` file)
- ✅ Web fallback — Cache API + retry (no Range on `fetch`, best-effort)
