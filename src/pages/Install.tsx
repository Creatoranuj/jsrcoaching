import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import {
  Smartphone,
  Monitor,
  Apple,
  Download,
  Share2,
  MoreVertical,
  Plus,
  ArrowLeft,
  CheckCircle2,
  Copy,
  MessageCircle,
  QrCode,
  Zap,
  Globe,
  Package,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import appLogo from "../assets/branding/jsr-mark.webp";
import { toast } from "sonner";
import { openResource } from "../lib/openResource";
import { tapHaptic } from "../lib/native/haptics";
import { isNativePlatform } from "../lib/native/core";

// Shared press-feedback class for the primary CTAs on this page. Matches the
// landing-page press feel (150ms ease-out, no arbitrary duration values).
const PRESS = "active:scale-[0.97] transition-transform duration-150 ease-out";

// ─── LATEST GITHUB APK LINK ──────────────────────────────────────────────────
// Canonical asset is JSRCoaching.apk, published by .github/workflows/build-apk.yml
// to github.com/Creatoranuj/jsrcoaching/releases.
// Fallback used when the GitHub Releases API is unreachable (rate limit /
// offline). The page still ALWAYS tries to resolve the newest release first.
const APK_REPO = "Creatoranuj/jsrcoaching";
const APK_ASSET_NAME = "JSRCoaching.apk";
// Offline/rate-limited fallback points at the canonical JSR asset name, which
// every current release publishes. (Older releases also carry a legacy-named
// copy, but it is never surfaced to users.)
const APK_FALLBACK_URL = `https://github.com/${APK_REPO}/releases/latest/download/${APK_ASSET_NAME}`;
const GITHUB_LATEST_API = `https://api.github.com/repos/${APK_REPO}/releases/latest`;
// Bumped v3 → v4 with the repo rename to Creatoranuj/jsrcoaching: older
// entries hold a dead release URL and would keep serving it for up to 6h.
const APK_CACHE_KEY = "nb:latest_apk:v5";
const APK_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
// Only ever hand a github.com / githubusercontent.com URL to the downloader —
// the API response is remote data, so treat it as untrusted.
const APK_HOST_RE = /^https:\/\/([a-z0-9-]+\.)*(github\.com|githubusercontent\.com)\//i;

type ApkInfo = { url: string; tag: string | null; size: number | null };

function formatMb(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readCachedApk(): ApkInfo | null {
  try {
    const raw = localStorage.getItem(APK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; url: string; tag: string | null; size?: number | null };
    if (!parsed?.url || Date.now() - parsed.ts > APK_CACHE_TTL_MS) return null;
    if (!APK_HOST_RE.test(parsed.url)) return null;
    return { url: parsed.url, tag: parsed.tag ?? null, size: parsed.size ?? null };
  } catch { return null; }
}

function writeCachedApk(info: ApkInfo) {
  try {
    localStorage.setItem(APK_CACHE_KEY, JSON.stringify({ ts: Date.now(), ...info }));
  } catch { /* noop */ }
}

async function fetchLatestApk(signal: AbortSignal): Promise<ApkInfo | null> {
  try {
    const res = await fetch(GITHUB_LATEST_API, {
      signal,
      headers: { Accept: "application/vnd.github+json" },
    });
    // 403 = unauthenticated rate limit (60/hr/IP), 404 = repo/release missing.
    // Both fall through to the cached/fallback URL already held in state.
    if (!res.ok) return null;
    const json: any = await res.json();
    const assets: any[] = Array.isArray(json?.assets) ? json.assets : [];
    const isApk = (a) =>
      typeof a?.browser_download_url === "string" && /\.apk$/i.test(a?.name || "");
    // Prefer the fixed-name canonical asset; fall back to any versioned
    // JSRCoaching*/legacy-named .apk, and only then to whatever .apk the release carries.
    const asset =
      assets.find((a) => isApk(a) && a.name === APK_ASSET_NAME) ??
      assets.find((a) => isApk(a) && /^(jsrcoaching|sadguru)/i.test(a.name)) ??
      assets.find(isApk);
    const url: string | undefined = asset?.browser_download_url;
    if (!url || !APK_HOST_RE.test(url)) return null;
    return {
      url,
      tag: typeof json?.tag_name === "string" ? json.tag_name : null,
      size: typeof asset?.size === "number" ? asset.size : null,
    };
  } catch { return null; }
}


type Platform = "android" | "ios" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  return "desktop";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

// Step card component
function StepCard({
  number,
  icon: Icon,
  title,
  description,
}: {
  number: number;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border">
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <span className="text-[10px] font-bold text-primary-foreground">{number}</span>
        </div>
      </div>
      <div>
        <p className="font-semibold text-sm text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

const Install = () => {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [promptUsed, setPromptUsed] = useState(false);
  const [copiedApk, setCopiedApk] = useState(false);
  // null = idle, -1 = started but length unknown, 0..100 = progress percent.
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const navigate = useNavigate();
  const appUrl = window.location.origin;

  // Resolved APK — cache-first so the page paints instantly with a URL we
  // already trust, then upgrades to the freshest release from the GitHub API.
  const [apk, setApk] = useState<ApkInfo>(() =>
    readCachedApk() ?? { url: APK_FALLBACK_URL, tag: null, size: null }
  );
  const apkUrl = apk.url;
  const apkSize = formatMb(apk.size);
  const apkQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(apkUrl)}`;
  // Tracks the throwaway download iframe timer so unmount can't leave a
  // pending DOM mutation behind (app-crash-shield: no uncleared timeouts).
  const downloadCleanupRef = useRef<{ frame: HTMLIFrameElement; timer: number } | null>(null);
  // Resets the transient "Starting download…" button state.
  const downloadResetRef = useRef<number | null>(null);
  const mountedRef = useRef(true);


  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setPromptUsed(false);
      toast.success("App installed");
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  // Resolve the newest APK from the GitHub Releases API on mount.
  // Silent failure — fallback URL is already in state.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchLatestApk(ctrl.signal).then((info) => {
      if (!info || ctrl.signal.aborted) return;
      setApk(info);
      writeCachedApk(info);
    });
    return () => ctrl.abort();
  }, []);

  // Release the throwaway download iframe if the user navigates away before
  // the 60s cleanup timer fires, and abort any streamed download in flight.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (downloadResetRef.current !== null) window.clearTimeout(downloadResetRef.current);
      downloadResetRef.current = null;
      const pending = downloadCleanupRef.current;
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pending.frame.parentNode?.removeChild(pending.frame);
      downloadCleanupRef.current = null;
    };
  }, []);

  const handleInstallPrompt = async () => {
    if (!deferredPrompt) return;
    void tapHaptic("medium");
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setPromptUsed(true);
      setDeferredPrompt(null);
    }
  };

  const copyApkLink = async () => {
    void tapHaptic("light");
    try {
      await navigator.clipboard.writeText(apkUrl);
      setCopiedApk(true);
      toast.success("APK link copied!");
      setTimeout(() => setCopiedApk(false), 2000);
    } catch {
      toast.error("Could not copy — long-press the link to copy manually.");
    }
  };

  const shareWhatsApp = () => {
    void tapHaptic("light");
    void openResource({
      url: `https://wa.me/?text=${encodeURIComponent(
        `📚 Install JSR Institute app!\n\n📦 Download APK (Android): ${apkUrl}\n\n🌐 Or install via browser: ${appUrl}/install`
      )}`,
      kind: "link",
    });
  };

  // Anchor / iframe fallback: still a direct file download (GitHub sends
  // Content-Disposition: attachment) and never lands on a GitHub page.
  const anchorDownload = () => {
    try {
      const a = document.createElement("a");
      a.href = apkUrl;
      a.download = APK_ASSET_NAME;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("APK download started! Check your downloads.");
      return true;
    } catch {
      return false;
    }
  };

  const handleDirectDownload = async () => {
    void tapHaptic("medium");
    if (downloadPct !== null) return; // already downloading — ignore double taps

    // Native (Capacitor WebView): the WebView has no download manager wired
    // up, so a hidden iframe silently does nothing. Hand the URL to the
    // system browser, which delegates to Android's DownloadManager.
    if (await isNativePlatform()) {
      await openResource({ url: apkUrl, kind: "link" });
      toast.success("Opening download — check your notifications.");
      return;
    }

    // Web: GitHub's release-asset CDN sends NO Access-Control-Allow-Origin
    // (verified 2026-07-31), so a fetch/blob download with a progress bar
    // would always fail CORS. The synthesized anchor click is the reliable
    // path: the asset is served with `Content-Disposition: attachment`, so the
    // browser downloads the file and the user never leaves this page.
    setDownloadPct(-1);
    const settle = window.setTimeout(() => {
      if (mountedRef.current) setDownloadPct(null);
    }, 2500);
    downloadResetRef.current = settle;

    if (anchorDownload()) return;


    // Last-resort fallback for browsers that ignore the anchor path.
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.src = apkUrl;
    document.body.appendChild(iframe);
    toast.success("APK download started! Check your downloads.");
    const timer = window.setTimeout(() => {
      iframe.parentNode?.removeChild(iframe);
      downloadCleanupRef.current = null;
    }, 60000);
    downloadCleanupRef.current = { frame: iframe, timer };
  };

  const goBack = () => {
    // /install is reachable while signed out (shared link / QR). Prefer real
    // history so we don't bounce an anonymous visitor into the auth gate.
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const platformTabs =[
    { key: "android" as Platform, icon: Smartphone, label: "Android", color: "text-primary" },
    { key: "ios" as Platform, icon: Apple, label: "iPhone / iPad", color: "text-foreground" },

    { key: "desktop" as Platform, icon: Monitor, label: "Desktop", color: "text-muted-foreground" },
  ];

  return (
    <main className="min-h-dvh bg-background">
      {/* Header bar */}
      <div
        className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm pt-[env(safe-area-inset-top)]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="container mx-auto px-4 py-3 flex items-center gap-3 max-w-2xl">
          <Button variant="ghost" size="icon" className="-ml-1" onClick={goBack} aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <img src={appLogo} alt="JSR Institute" className="h-9 w-9 rounded-xl object-cover" />
          <span className="font-semibold text-foreground">Install App</span>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-2xl pb-16">

        {/* Hero gradient section */}
        <div className="relative overflow-hidden rounded-2xl mt-5 mb-6 bg-gradient-to-br from-primary/20 via-primary/10 to-background border border-primary/20 px-6 pt-8 pb-6 text-center">
          <img
            src={appLogo}
            alt="JSR Institute"
            className="mx-auto h-32 w-32 object-contain drop-shadow-2xl mb-3 rounded-3xl"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <h1 className="text-2xl font-bold text-foreground">Install JSR Institute App</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Get the full learning experience on your device — works offline too!
          </p>

          {/* One-tap install if PWA prompt available */}
          {deferredPrompt && !promptUsed && (
            <Button
              size="lg"
              className={`mt-5 gap-2 w-full max-w-xs shadow-lg ${PRESS}`}
              onClick={handleInstallPrompt}
            >
              <Zap className="h-4 w-4" />
              Install App Now — One Tap!
            </Button>
          )}
        </div>

        {/* Already installed banner */}
        {installed && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/25 mb-5">
            <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0" />
            <div>
              <p className="font-semibold text-primary text-sm">
                You're already using the JSR Institute app! 🎉
              </p>
              <p className="text-xs text-muted-foreground">
                This app is installed and running in standalone mode.
              </p>
            </div>
          </div>
        )}

        {/* Platform tabs */}
        <div className="flex gap-2 mb-5">
          {platformTabs.map(({ key, icon: Icon, label, color }) => (
            <button
              key={key}
              onClick={() => setPlatform(key)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-xl border text-xs font-medium transition-all ${
                platform === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              <Icon className={`h-5 w-5 ${platform === key ? "text-primary" : color}`} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* ── APK Direct Download QR Code card (always visible) ── */}
        <div className="mb-5 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-3 bg-primary/10 border-b border-primary/20">
            <QrCode className="h-5 w-5 text-primary" />
            <p className="font-bold text-sm text-foreground">📦 Scan QR to Download APK</p>
            <span className="ml-auto text-[10px] font-bold bg-primary/15 text-primary px-2 py-0.5 rounded-full">ANDROID</span>
          </div>
          <div className="p-5">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* APK QR code */}
              <div className="flex-shrink-0 flex flex-col items-center gap-2">
                <div className="p-3 bg-white rounded-xl border border-border shadow-md">
                  <img
                    src={apkQrUrl}
                    alt="QR Code — scan to download APK"
                    className="w-[180px] h-[180px]"
                    onError={(e) => {
                      (e.target as HTMLImageElement).parentElement!.innerHTML =
                        '<div class="w-[180px] h-[180px] flex items-center justify-center text-xs text-gray-400 text-center p-4">QR unavailable<br/>Use link below</div>';
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  Scan with phone camera<br />to download APK directly
                </p>
              </div>

              {/* Right: info + buttons */}
              <div className="flex-1 space-y-3 w-full sm:w-auto">
                <p className="text-sm font-medium text-foreground">Direct APK Download</p>
                <p className="text-xs text-muted-foreground">
                  Point your Android camera at this QR code — it downloads the APK straight to your phone without opening GitHub.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    className={`w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground ${PRESS}`}
                    onClick={handleDirectDownload}
                    disabled={downloadPct !== null}
                  >
                    <Download className="h-4 w-4" />
                    {downloadPct === null ? "Download APK Directly" : "Starting download…"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center tabular-nums">
                    {apk.tag ? `${apk.tag} · ` : ""}{apkSize ?? "latest build"}
                  </p>
                  <Button
                    variant="outline"
                    className={`w-full gap-2 justify-start ${PRESS}`}
                    onClick={copyApkLink}
                  >
                    {copiedApk ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copiedApk ? "APK Link Copied!" : "Copy APK Link"}
                  </Button>
                  <Button
                    className={`w-full gap-2 justify-start bg-primary hover:bg-primary/90 text-primary-foreground ${PRESS}`}
                    onClick={shareWhatsApp}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Share APK on WhatsApp
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── ANDROID ── */}
        {platform === "android" && (
          <div className="space-y-4">
            {/* Option A: APK */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 bg-primary/10 border-b border-primary/20">
                <Package className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-bold text-sm text-foreground">Option A — Download APK</p>
                  <p className="text-xs text-muted-foreground">Recommended · Works like a native app</p>
                </div>
                <span className="ml-auto text-[10px] font-bold bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                  RECOMMENDED
                </span>
              </div>
              <div className="p-5 space-y-4">
                <Button
                  className={`w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground ${PRESS}`}
                  onClick={handleDirectDownload}
                  disabled={downloadPct !== null}
                >
                  <Download className="h-4 w-4" />
                  {downloadPct === null ? "Download APK" : "Starting download…"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center tabular-nums">
                  Android 7.0+{apkSize ? ` · ${apkSize}` : ""}{apk.tag ? ` · Latest: ${apk.tag}` : ""}
                </p>


                <div className="space-y-2">
                  {[
                    { n: 1, title: "Download the APK file", desc: "Tap the button above to start" },
                    {
                      n: 2,
                      title: "Allow unknown sources",
                      desc: 'Open Settings → Security → Enable "Install unknown apps"',
                    },
                    { n: 3, title: "Open the downloaded file", desc: "Tap the APK in your notifications" },
                    { n: 4, title: "Tap Install & Open", desc: "App icon will appear on your home screen" },
                  ].map((s) => (
                    <div key={s.n} className="flex gap-3 items-start">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
                        <span className="text-[10px] font-bold text-primary">{s.n}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.title}</p>
                        <p className="text-xs text-muted-foreground">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Option B: PWA */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 bg-muted/60 border-b border-border">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-bold text-sm text-foreground">Option B — Install from Chrome</p>
                  <p className="text-xs text-muted-foreground">No download needed · Instant install</p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                {deferredPrompt ? (
                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    onClick={handleInstallPrompt}
                  >
                    <Zap className="h-4 w-4 text-primary" />
                    One-Tap Install via Browser
                  </Button>
                ) : null}
                <StepCard
                  number={1}
                  icon={Globe}
                  title="Open in Chrome"
                  description="Make sure you're using Chrome browser on Android"
                />
                <StepCard
                  number={2}
                  icon={MoreVertical}
                  title='Tap the "⋮" menu'
                  description="Top-right corner of Chrome browser"
                />
                <StepCard
                  number={3}
                  icon={Plus}
                  title='Tap "Add to Home screen"'
                  description='Or "Install app" — then confirm with "Add"'
                />
              </div>
            </div>
          </div>
        )}

        {/* ── iOS ── */}
        {platform === "ios" && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-foreground/5 border-b border-border">
              <Apple className="h-5 w-5 text-foreground" />
              <div>
                <p className="font-bold text-sm text-foreground">Install on iPhone / iPad</p>
                <p className="text-xs text-muted-foreground">Requires Safari browser</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-lg bg-gold/15 border border-gold/30 px-4 py-3 text-sm text-foreground flex gap-2">
                <span className="text-base">⚠️</span>
                <span>Must use <strong>Safari</strong> — Chrome on iPhone does not support Add to Home Screen.</span>
              </div>
              <StepCard
                number={1}
                icon={Globe}
                title="Open this page in Safari"
                description="Copy the URL and paste into Safari if needed"
              />
              <StepCard
                number={2}
                icon={Share2}
                title='Tap the Share button'
                description='The box-with-arrow icon at the bottom of Safari'
              />
              <StepCard
                number={3}
                icon={Plus}
                title='"Add to Home Screen"'
                description="Scroll down in the share sheet and tap this option"
              />
              <StepCard
                number={4}
                icon={CheckCircle2}
                title='Tap "Add" to confirm'
                description="The JSR Institute app icon will appear on your home screen!"
              />
              <p className="text-xs text-muted-foreground text-center pt-1">
                Works offline · Feels like a native app · No App Store needed
              </p>
            </div>
          </div>
        )}

        {/* ── DESKTOP ── */}
        {platform === "desktop" && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-muted/60 border-b border-border">
              <Monitor className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-bold text-sm text-foreground">Install on Desktop</p>
                <p className="text-xs text-muted-foreground">Chrome, Edge, or Brave</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {deferredPrompt && (
                <Button
                  size="lg"
                  className="w-full gap-2"
                  onClick={handleInstallPrompt}
                >
                  <Download className="h-4 w-4" />
                  Install Desktop App — One Click
                </Button>
              )}
              <div className="space-y-3">
                <StepCard
                  number={1}
                  icon={Globe}
                  title="Open in Chrome / Edge / Brave"
                  description="Other browsers may not support PWA installation"
                />
                <StepCard
                  number={2}
                  icon={Plus}
                  title="Look for the install icon"
                  description='Click the ⊕ icon in the address bar (right side)'
                />
                <StepCard
                  number={3}
                  icon={CheckCircle2}
                  title='Click "Install"'
                  description='The app will open in its own window!'
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default Install;
