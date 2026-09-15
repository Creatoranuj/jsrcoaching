/**
 * Lovable asset URL helper.
 *
 * Problem: Lovable assets expose `/__l5e/assets-v1/...` URLs. In a normal
 * web deploy these resolve against the app's own domain, so they work without
 * a full origin. In a Capacitor APK the WebView origin is `capacitor://localhost`
 * (or `https://localhost`), so relative `/__l5e/...` URLs 404.
 *
 * Solution: on native builds prepend the project preview domain so the
 * WebView fetches the immutable asset directly from the CDN. On web builds
 * keep the relative URL so the asset is served from the current domain
 * (preview or custom domain).
 *
 * If you publish to a custom domain and want assets to load from that domain
 * instead, change `DEFAULT_ASSET_BASE` to your production Lovable domain.
 */

const DEFAULT_ASSET_BASE = "https://id-preview--d7075340-380a-474a-82d4-84675a89a7f9.lovable.app";

function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform();
}

export interface LovableAsset {
  url: string;
}

export function getAssetUrl(asset: LovableAsset): string {
  // Web / SSR: relative URL keeps the asset on the same domain.
  if (!isNativePlatform()) return asset.url;

  // Native: absolute URL so capacitor://localhost can fetch the CDN asset.
  const base = DEFAULT_ASSET_BASE;
  const url = asset.url;
  return `${base.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}
