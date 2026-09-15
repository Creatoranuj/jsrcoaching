import { WebPlugin } from '@capacitor/core';
import type { NbPdfPlugin, FetchPdfOptions, FetchPdfResult, ProgressEvent } from './index';

/**
 * Browser fallback: uses Cache API + streaming fetch.
 * Not durable across sessions on iOS Safari private mode; that's OK — the
 * point of the plugin is native durability. Web is a graceful fallback so
 * `import { NbPdf }` never throws in Lovable preview / SSR.
 */
export class NbPdfWeb extends WebPlugin implements NbPdfPlugin {
  private readonly CACHE = 'nb-pdf-v1';
  /** Memory-blob fallback for environments where Cache API throws
   *  (iOS Safari private mode, some in-app browsers, SSR). */
  private readonly memBlobs = new Map<string, Blob>();

  private async openCache(): Promise<Cache | null> {
    try {
      if (typeof caches === 'undefined') return null;
      return await caches.open(this.CACHE);
    } catch {
      return null;
    }
  }

  async fetchPdf(opts: FetchPdfOptions): Promise<FetchPdfResult> {
    const start = performance.now();
    const cache = await this.openCache();
    const req = new Request(opts.url, { headers: opts.headers });

    if (!opts.force) {
      let blob: Blob | undefined;
      if (cache) {
        try {
          const hit = await cache.match(req);
          if (hit) blob = await hit.blob();
        } catch { /* fall through to memBlobs */ }
      }
      if (!blob) blob = this.memBlobs.get(opts.cacheKey);
      if (blob) {
        return {
          localUri: URL.createObjectURL(blob),
          size: blob.size,
          fromCache: true,
          elapsedMs: Math.round(performance.now() - start),
        };
      }
    }

    const res = await this.fetchWithRetry(req, opts.cacheKey);
    const blob = await res.blob();
    if (cache) {
      try {
        await cache.put(req, new Response(blob));
      } catch {
        this.memBlobs.set(opts.cacheKey, blob);
      }
    } else {
      this.memBlobs.set(opts.cacheKey, blob);
    }
    return {
      localUri: URL.createObjectURL(blob),
      size: blob.size,
      fromCache: false,
      elapsedMs: Math.round(performance.now() - start),
    };
  }

  private async fetchWithRetry(req: Request, cacheKey: string, maxAttempts = 4): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(req);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // best-effort progress event
        const total = Number(res.headers.get('content-length') ?? -1);
        this.notifyListeners('pdfProgress', {
          cacheKey, percent: total > 0 ? 0 : -1, loadedBytes: 0, totalBytes: total, attempt,
        } satisfies ProgressEvent);
        return res;
      } catch (err) {
        lastErr = err;
        // exponential backoff: 400ms, 800ms, 1600ms
        await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
      }
    }
    throw lastErr;
  }

  async evict(opts: { cacheKey: string }): Promise<void> {
    this.memBlobs.delete(opts.cacheKey);
    const cache = await this.openCache();
    if (!cache) return;
    try {
      // Web fallback maps cacheKey → url loosely; caller should re-pass url on native.
      await cache.delete(opts.cacheKey);
    } catch { /* noop */ }
  }

  async pin(_opts: { cacheKey: string }): Promise<void> { /* no-op on web */ }
  async unpin(_opts: { cacheKey: string }): Promise<void> { /* no-op on web */ }

  async clearCache(): Promise<{ freedBytes: number }> {
    this.memBlobs.clear();
    try { await caches?.delete(this.CACHE); } catch { /* noop */ }
    return { freedBytes: 0 };
  }

  async stats() {
    return { entries: 0, bytes: 0, capacityBytes: 0 };
  }
}
