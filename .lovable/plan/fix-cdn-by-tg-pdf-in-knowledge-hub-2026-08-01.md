# Fix "CDN BY TG" PDF in Knowledge Hub

## What I verified

- Only one Telegram-storage lesson exists: **"CDN BY TG"** in Knowledge Hub, stored in `lessons.video_url` as
  `https://storage-naveenbharat-recording.vercel.app/view/545ff388-…`.
- The upstream storage is healthy right now: metadata returns `morpho_compressed.pdf` and the file endpoint returns 5.4 MB starting with `%PDF-1.4`.
- No `resolve-storage-pdf` invocations appear in the edge logs, so the reader is very likely never getting valid bytes from our proxy before it fails.

## Root cause of the misleading error

`src/hooks/useLocalPdfSource.ts` materialises this link through `resolveStorageBytes()` (our authenticated `resolve-storage-pdf` proxy). If that call fails for **any** reason — expired session, 403 entitlement, 503 upstream, 18 s timeout — the catch block silently falls back to `setState({ src: url })`, handing pdf.js the **HTML viewer page**. pdf.js then throws `Invalid PDF structure`, which is exactly the screenshot. The real reason is swallowed, so every distinct failure looks identical.

## Fix

1. **Stop the HTML fallback for storage viewer links** (`useLocalPdfSource.ts`)
   - For `isResolvableStorageViewerUrl(url)`, never fall back to `src: url`. Surface the real error text from the proxy instead (`storage_key_rejected`, `Not entitled…`, `Sign in required…`, timeout).
   - Keep the passthrough fallback for the other local/native cases unchanged.

2. **Propagate the proxy's real reason** (`src/lib/native/naveenStoragePdf.ts`)
   - Parse the JSON error body on non-OK responses in the native path too (web path already does) and throw a message that carries the server `code`.
   - Add one retry with a refreshed Supabase access token on 401 (same pattern as `pdfProxyAuthRetry.ts`) so an expired token doesn't kill the open.

3. **Friendly messages** (`src/lib/pdfErrorMessage.ts`)
   - Map `storage_key_rejected`, `Asset not registered`, `Not entitled`, and `Sign in required` to clear Hindi/English lines with the right action, instead of "Invalid PDF structure".

4. **Retry that actually retries** (`FastPdfReader` byte-fallback)
   - Ensure the Retry button re-runs `resolveStorageBytes` (fresh token) rather than re-loading the failed `src`.

5. **Verify**
   - Run the existing PDF tests plus a new unit test asserting that a failing storage resolve produces an error state, not an HTML passthrough.
   - After deploy, open the lesson and read `resolve-storage-pdf` logs to confirm a 200 with `%PDF-` and, if a non-200 appears, fix that specific cause (key/entitlement) in a follow-up with the log evidence.

## Technical notes

- No change to the inlined upstream publishable anon key or the entitlement gate; `resolve-storage-pdf` already validates `%PDF-` bytes and forces `application/pdf`.
- No new dependencies; all edits are client-side error handling plus one test.
