# Remove the free video section from the landing page

The video cards shown in the screenshot (Farewell Class-12, Spoken English, etc.) come from the "Free Lectures" tab of the Free resources section. They will be removed completely — no YouTube thumbnails or embeds will remain on the landing page.

## What changes

- Delete the video grid component (`src/components/Landing/FreeVideoGrid.tsx`), including its lightbox player.
- In `src/components/Landing/FreeContent.tsx`, remove the "Free Lectures" tab and its content; the section keeps the "Free PDFs" and "Free Tests" tabs, with PDFs becoming the default tab.
- Keep the section heading ("Sab kuch free — try karein, tab decide karein") and the rest of the landing page untouched.

## Technical notes

- `FreeContent` is the only consumer of `FreeVideoGrid`; no other file imports it, so deletion is safe.
- The section id `videos-section` is not referenced by any nav link or anchor in the codebase; it will be renamed to `free-resources` for accuracy.
- `defaultValue` on the Tabs switches from `lectures` to `pdfs`.
- Verify with a typecheck and a rendered check of the landing page at mobile width to confirm no YouTube thumbnail remains.
