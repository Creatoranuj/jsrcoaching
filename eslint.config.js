import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "android",
      "ios",
      "boilerplate",
      "node_modules",
      // Vendored, unmodified pdf.js distribution — linting third-party build
      // output produced 37 of the repo's lint errors and none are ours to fix.
      "public/pdfjs/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "off",
      // Re-enabled as warn so future drift surfaces in editor/CI without failing builds.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/incompatible-library": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      // "Compilation Skipped: Existing memoization could not be preserved" is an
      // optimization notice, not a defect — the React Compiler simply leaves the
      // hand-written useCallback/useMemo in place. Kept visible as a warning so
      // drift is tracked without failing CI over a non-bug.
      "react-hooks/preserve-manual-memoization": "warn",
      "no-empty": "off",
      "no-useless-assignment": "off",
      "prefer-const": "off",
    },
  },
  // Guardrail: keep raw @capacitor/* imports inside the bridge layer.
  // Feature code must go through `@/lib/bridge` or `@/lib/native/*` wrappers.
  // Flipped to "error" 2026-06-08 — only allowed escape hatches are the
  // bridge layer, the platform shim, and tests.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/bridge/**",
      "src/lib/native/**",
      "src/lib/platform.ts",
      // Legacy bridge-layer files (now moved under src/lib/native/**, above).
      "src/lib/nativeChrome.ts",
      "src/lib/nativeStorage.ts",
      "src/lib/nativePdfHttp.ts",
      "src/**/*.test.{ts,tsx}",
      "src/test/**",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@capacitor/*", "@capgo/*"],
          message: "Import via @/lib/bridge or add a wrapper in src/lib/native/. See docs/briefs/02-07-best-practices-and-plugins.md",
        }],
      }],
    },
  },

  // Guardrail: overlays MUST register their back-sentinel via the shared
  // hooks (useOverlayHistorySentinel / useOverlayBackClose / useFakeFullscreen)
  // so the Android back-button breadcrumb trail behaves consistently.
  // Raw `window.history.pushState({...})` calls in feature code bypass the
  // sentinel registry and lead to fall-through-to-nav back-button bugs.
  // Pre-existing known-good sentinel sites use an `// eslint-disable-next-line`
  // comment to opt-in explicitly.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/pages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["warn", {
        selector: "CallExpression[callee.object.object.name='window'][callee.object.property.name='history'][callee.property.name='pushState']",
        message: "Don't call window.history.pushState directly in components/pages. Use useOverlayHistorySentinel() (or useOverlayBackClose / useFakeFullscreen) so the back-button trail stays consistent. See docs/briefs/03-05-deeplinks-offline.md.",
      }],
    },
  },

  // Guardrail: PDF / Notion / DocumentReader surfaces must stay fully in-app.
  // Importing `openExternal` (or any system-browser opener) from these files
  // is what previously caused PDFs and Notion pages to bounce out to Chrome
  // Custom Tabs / Safari, losing the back-button trail. If you genuinely need
  // an escape hatch, render it via a UniversalFileViewer LINK kind instead.
  {
    files: [
      "src/components/video/Pdf*.{ts,tsx}",
      "src/components/video/FastPdf*.{ts,tsx}",
      "src/components/video/Notion*.{ts,tsx}",
      "src/components/course/DocumentReader.{ts,tsx}",
      "src/components/course/ReaderErrorOverlay.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/lib/native/browser",
          importNames: ["openExternal"],
          message: "PDF/Notion/Document surfaces must stay in-app. Do NOT import openExternal here — it leaks users to the system browser and breaks the back stack. See docs/briefs/03-05-deeplinks-offline.md.",
        }],
        patterns: [{
          group: ["**/lib/native/browser", "**/lib/native/openNativeDocument"],
          message: "PDF/Notion/Document surfaces must stay in-app. Do NOT import the native browser bridge here.",
        }],
      }],
    },
  },

  // Guardrail: raw window.localStorage / window.sessionStorage throws in
  // Safari private mode and iOS WKWebView with cookies disabled. Feature
  // code must go through the safeGet/safeSet wrappers in src/lib/storage.ts
  // so callers get a bounded, try/catch-guarded API. The wrapper module
  // itself, tests, and vendored SW code are exempt.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/storage.ts",
      "src/**/*.test.{ts,tsx}",
      "src/test/**",
    ],
    rules: {
      "no-restricted-syntax": ["warn",
        {
          selector: "MemberExpression[object.name='localStorage']",
          message: "Use safeGet/safeSet/safeRemove from @/lib/storage instead of raw localStorage — it throws in Safari private mode / restricted WKWebViews.",
        },
        {
          selector: "MemberExpression[object.property.name='localStorage']",
          message: "Use safeGet/safeSet/safeRemove from @/lib/storage instead of raw window.localStorage — it throws in Safari private mode / restricted WKWebViews.",
        },
        {
          selector: "MemberExpression[object.name='sessionStorage']",
          message: "Use safeSessionGet/safeSessionSet from @/lib/storage instead of raw sessionStorage.",
        },
      ],
    },
  },

  // Guardrail: reorderable / data-driven lists must key on a stable id,
  // not the array index. key={index} / key={i} on rows that get inserted,
  // removed, or reordered re-binds the wrong component state.
  // Static skeleton loops (Array.from({length:N})) are exempt via
  // // eslint-disable-next-line.
  {
    files: [
      "src/pages/**/*.{ts,tsx}",
      "src/components/admin/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": ["warn",
        {
          selector: "JSXAttribute[name.name='key'] JSXExpressionContainer > Identifier[name='index']",
          message: "Don't use key={index} on data-driven lists — key on item.id. If this is a static skeleton loop, add // eslint-disable-next-line.",
        },
        {
          selector: "JSXAttribute[name.name='key'] JSXExpressionContainer > Identifier[name='i']",
          message: "Don't use key={i} on data-driven lists — key on item.id. If this is a static skeleton loop, add // eslint-disable-next-line.",
        },
      ],
    },
  },

  // Guardrail: raw `window.open` on user-content URLs ejects the user out
  // of the Capacitor WebView (opens Chrome / Safari), losing the app back
  // stack and breaking the in-app reader trail. Every PDF / image / doc
  // open MUST funnel through `openResource()` in src/lib/openResource.ts.
  //
  // Exempt files: the funnel itself, the native-browser bridge (which IS
  // the wrapper), the last-resort download fallback, and admin new-tab
  // surfaces (desktop-only admin dashboard, intentional new tab).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/openResource.ts",
      "src/lib/native/browser.ts",
      "src/lib/downloadDocument.ts",
      "src/services/pdfLibrary.ts",
      "src/pages/AdminLiveManager.tsx",
      "src/**/*.test.{ts,tsx}",
      "src/test/**",
    ],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "CallExpression[callee.object.name='window'][callee.property.name='open']",
        message: "Use openResource() from @/lib/openResource instead — raw window.open ejects users out of the Capacitor WebView and breaks the back stack.",
      }],
    },
  },

);
