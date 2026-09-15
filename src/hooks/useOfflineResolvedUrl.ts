import { useEffect, useState } from "react";
import { getDownloads } from "../lib/indexedDB";
import { releaseDownloadUri, resolveDownloadUri } from "../services/savedDownloads";
import type { DownloadRecord } from "../lib/indexedDB";

/**
 * Given a remote (course/lesson) file URL, prefer a locally-saved copy from
 * the Downloads index when available. Falls back to the original URL when
 * nothing has been downloaded, or when resolving the local copy fails.
 *
 * This lets every PdfViewer site (lesson view, attachments, DPP, etc.) open
 * offline without each call-site having to wire the downloads service.
 *
 * When a local blob URL is minted for the resolved record, it is released on
 * unmount / URL change so long-lived viewers don't pin the underlying Blob.
 */
export function useOfflineResolvedUrl(url: string): { url: string; ready: boolean } {
  const [resolved, setResolved] = useState<string>(url);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    let mintedFor: DownloadRecord | null = null;
    setReady(false);
    setResolved(url);
    if (!url || /^(capacitor:|ionic:|file:|blob:|data:|web-indexeddb:|nb-personal-library:|nb-download:)/i.test(url)) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        const all = await getDownloads();
        const match = all.find((r) => r.url === url && !!r.local_path);
        if (!match) {
          if (alive) setReady(true);
          return;
        }
        const local = await resolveDownloadUri(match);
        if (alive) {
          // `nb-download:{id}` reads bytes directly (no blob URL to release).
          // Only mint-release for the legacy blob-URL path.
          mintedFor = local.startsWith("blob:") ? match : null;
          setResolved(local);
          setReady(true);
        } else if (local.startsWith("blob:")) {
          // Component unmounted while we were resolving — release immediately.
          releaseDownloadUri(match);
        }
      } catch {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
      if (mintedFor) releaseDownloadUri(mintedFor);
    };
  }, [url]);

  return { url: resolved, ready };
}
