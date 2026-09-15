# Brief — Group D: Deep Linking (#3) + Offline-First (#5)

## #3 — Deep linking

### What's already wired

- **iOS Universal Links:** `public/.well-known/apple-app-site-association` lists the allowed paths (`/course/*`, `/my-courses/*`, `/classes/*`, `/quiz/*`, `/live/*`, `/reset-password`, `/payment-callback`, `/dashboard`).
- **Android App Links:** `public/.well-known/assetlinks.json` — **REPLACE_WITH_RELEASE_KEYSTORE_SHA256_FINGERPRINT** must be replaced from CI signing config before publishing.
- **Custom URL scheme:** `com.safarenglishka.app://…`
- **Router glue:** `useDeepLinks()` (`src/hooks/useDeepLinks.ts`) translates both cold-start (`App.getLaunchUrl`) and warm (`appUrlOpen`) into React Router navigation, host-allow-listed against `safarenglishka.vercel.app` + the Lovable preview.

### Pre-publish checklist

1. Replace `TEAMID` in AASA with the real Apple team ID once provisioned.
2. Run `keytool -list -v -keystore release.keystore -alias <alias>` and paste the SHA256 into `assetlinks.json`.
3. Verify with:
   ```bash
   curl -I https://safarenglishka.vercel.app/.well-known/apple-app-site-association
   curl   https://safarenglishka.vercel.app/.well-known/assetlinks.json
   ```
   Both must be `200 OK`, served with `Content-Type: application/json`, no redirects.
4. Android: `adb shell pm get-app-links com.safarenglishka.app` → `verified`.

### Auth-replay rule

When the inbound URL is a privileged path (`/reset-password`, `/payment-callback`, `/dashboard`), `useDeepLinks` navigates immediately and lets the route's own guard re-check `useAuth()`. Do **not** add a second auth gate inside the deep-link handler — that double-gate causes the well-known "tap link → bounce to login → manual re-tap" loop.

### Adding a new deep-linked route

1. Add the path glob to both AASA `paths` and `assetlinks.json` (only if Android `pathPrefix` needs to change in `AndroidManifest.xml`).
2. Add the page route to the React Router tree as normal.
3. If the page reads URL params, parse them defensively — deep-link payloads can come from email and are NOT to be trusted.

---

## #5 — Offline-first

### What's already wired

- **`useOnlineStatus()`** — `@capacitor/network` on native, `navigator.onLine` on web.
- **TanStack Query persister** (`src/lib/perf/queryPersister.ts`, from Group #6) — reads stay warm across cold starts.
- **PDF + lesson offline cache** — IndexedDB-backed (`src/lib/indexedDB.ts`, `personalLibraryDB.ts`).

### New: minimal mutation queue

`src/lib/offline/mutationQueue.ts` adds the missing piece: a tiny localStorage-backed queue for low-volume fire-and-forget writes.

```ts
// 1. Register handlers ONCE at boot (in main.tsx)
import { registerMutationHandler, installMutationQueueRunner } from "@/lib/offline/mutationQueue";

registerMutationHandler("note.update", async (payload) => {
  await supabase.from("notes").upsert(payload as never);
});
installMutationQueueRunner(); // drains on `online` events

// 2. Feature code enqueues instead of awaiting
import { enqueueMutation } from "@/lib/offline/mutationQueue";

enqueueMutation("note.update", { id, body });
```

### What the queue is NOT for

- **Payments / enrollment** — always go through the edge function with an idempotency key. Replays are dangerous when money is involved.
- **Auth** — `supabase-js` already handles token refresh; don't queue session writes.
- **Large blobs** — use IndexedDB / the existing personal library DB.

### Conflict policy

Last-write-wins. The queue does not pull remote diffs. If a feature needs true sync (CRDT, vector clocks), use a dedicated repository pattern instead of this queue.
