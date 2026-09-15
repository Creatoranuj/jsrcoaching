import type { CapacitorConfig } from '@capacitor/cli';

// Production APK ships fully self-contained from dist/. To run a live-reload
// dev build pointed at a sandbox URL, add a local `server.url` in an untracked
// override — do NOT commit it (the prior hard-coded URL leaked the wrong
// sandbox ID into the repo).

const config: CapacitorConfig = {
  appId: 'com.jsrcoaching.app',
  appName: 'JSR COACHING',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    // Enable WebView remote debugging (chrome://inspect) ONLY in dev builds.
    // Production APKs ship with this OFF so attackers can't attach a debugger.
    // Toggle locally by setting CAP_DEBUG=1 before `npm run build`.
    // Explicit `=== '1'` keeps the default `false` for every CI invocation.
    webContentsDebuggingEnabled: process.env.CAP_DEBUG === '1',
  },
  ios: {
    // Same rule for iOS — Safari Web Inspector available only in dev builds.
    webContentsDebuggingEnabled: process.env.CAP_DEBUG === '1',
  },
  server: {
    androidScheme: 'https',
    // Native document surfaces: allow these hosts to complete their internal
    // redirects when opened in Capacitor browser surfaces. Without this,
    // Drive/Docs/Notion can silently land on a white WebView.
    allowNavigation: [
      // Google Drive / Docs viewers — narrowed from '*.google.com' wildcard
      // which allowed any Google subdomain (including open-redirector targets).
      'drive.google.com',
      'docs.google.com',
      'accounts.google.com',
      'lh3.googleusercontent.com', // narrowed from '*.googleusercontent.com' — avatars/thumbs only
      'fonts.gstatic.com',
      'ssl.gstatic.com',
      // Notion embeds
      '*.notion.site',
      '*.notion.so',
      '*.notion.com',
      // Bunny CDN (video/PDF assets)
      '*.b-cdn.net',
      '*.bunnycdn.com',
      // Archive.org (books)
      'archive.org',
      '*.archive.org',
      // jsDelivr for pdf.js worker
      'cdn.jsdelivr.net',
      // NOTE: Supabase hosts removed — API calls go via fetch(), not WebView
      // navigation. Keeping them here widened the WebView's trust surface.
    ],
  },
  plugins: {
    // PrivacyScreen: JS-controlled ONLY. Plugin default is `enable: true`
    // which applies Android FLAG_SECURE at Activity onCreate BEFORE JS boots
    // — that traps admins with protection ON even though our JS bypass logic
    // in `src/hooks/useScreenProtection.ts` wants to call `disable()`.
    // Setting this to `false` means the plugin does nothing on load; JS is
    // the single source of truth for FLAG_SECURE. DO NOT flip back to true.
    PrivacyScreen: {
      enable: false,
    },
    SplashScreen: {
      // JS-controlled: SplashHider.tsx hides splash on first React paint
      // for the fastest possible cold-start. A 2s safety timeout in JS
      // guarantees the splash never hangs even if React fails to mount.
      launchAutoHide: false,
      launchFadeOutDuration: 200,
      backgroundColor: '#F7F4EE',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    // CapacitorUpdater (Capgo) removed — paid SaaS, not used. Updates ship via Play Store APK.
    StatusBar: {
      // Native defaults applied before JS boots so the first frame matches
      // the app theme (warm paper-white). Runtime overrides in nativeChrome.ts
      // re-apply on dark-mode toggle.
      style: 'LIGHT',
      backgroundColor: '#F7F4EE',
      // SA2: WebView flows behind the status bar; CSS env(safe-area-inset-top)
      // provides the visual gutter. Avoids double-padding (status-bar height +
      // safe-area inset) that occurred with `false` on notched devices.
      overlaysWebView: true,
    },
    Keyboard: {
      // `native` lets the WebView shrink so fixed footers stay visible
      // (paired with --nb-keyboard-h CSS var set by installKeyboardInsetTracker).
      resize: 'native',
      style: 'DEFAULT',
      resizeOnFullScreen: true,
      // Hide the iOS "Done" accessory bar above the keyboard — it overlaps
      // our input footers and is redundant with the native return key.
      accessoryBarVisible: false,
    },
  },
};

export default config;
