import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface FetchPdfOptions {
  /** Absolute URL of the PDF (Drive direct link, R2, Supabase Storage, etc.) */
  url: string;
  /** Stable id used as cache key (e.g. `lesson:<id>:main-pdf`). */
  cacheKey: string;
  /** Max age in seconds before revalidation (default 7d). */
  maxAgeSec?: number;
  /** Extra HTTP headers (auth, Range hints). */
  headers?: Record<string, string>;
  /** If true, force-refresh bypassing cache. */
  force?: boolean;
}

export interface FetchPdfResult {
  /** file:// URI usable by WebView / pdf.js worker via `capacitor://` bridge. */
  localUri: string;
  /** Bytes on disk. */
  size: number;
  /** true when served from disk cache without any network hit. */
  fromCache: boolean;
  /** Milliseconds between call and completion. */
  elapsedMs: number;
}

export interface ProgressEvent {
  cacheKey: string;
  /** 0..100 integer. -1 = unknown length (no Content-Length header). */
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  /** attempt number, starts at 1. */
  attempt: number;
}

export interface NbPdfPlugin {
  /** Download-or-cache-hit. Resolves with a `file://` URI ready to render. */
  fetchPdf(options: FetchPdfOptions): Promise<FetchPdfResult>;
  /** Drop a specific entry. */
  evict(options: { cacheKey: string }): Promise<void>;
  /** Pin a key so it survives LRU eviction (e.g. while the PDF is on-screen). */
  pin(options: { cacheKey: string }): Promise<void>;
  /** Unpin a previously pinned key. */
  unpin(options: { cacheKey: string }): Promise<void>;
  /** Wipe the entire cache. */
  clearCache(): Promise<{ freedBytes: number }>;
  /** Cache metrics for debugging / observability. */
  stats(): Promise<{ entries: number; bytes: number; capacityBytes: number }>;
  addListener(
    eventName: 'pdfProgress',
    listenerFunc: (ev: ProgressEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const NbPdf = registerPlugin<NbPdfPlugin>('NbPdf', {
  // Web fallback uses fetch() + Cache API so the same TS surface works in
  // Lovable preview and PWA installs.
  web: () => import('./web').then((m) => new m.NbPdfWeb()),
});
