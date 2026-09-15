# WhatsApp number, missing course images, PDF download fix

## 1. WhatsApp number

Change the site-wide WhatsApp/contact number to **7388459249** (`917388459249`) in `src/components/common/WhatsAppButton.tsx`. Every other place (floating button, footer chat + tel link, course cards) reads this one constant, so they all update together.

Note: the footer "call" link also uses this constant, so the phone number shown there changes too.

## 2. Course images show a PDF placeholder

Verified cause (not a UI bug):

- The course "Class 12 Batch 2027" does have an image in storage (`content/courses/class12-batch-2027.jpg`), and the file really exists.
- The `content` storage bucket is private and currently has **only admin read policies**. A logged-in student has no read permission, so signing the image URL fails and the card falls back to the red PDF placeholder.
- The same applies to `lecture-pdfs` and `lesson-attachments` — admin/teacher only.

Fix: a database migration adding read access for signed-in users:

- `content` bucket: allow signed-in users to read public-presentation folders (`courses/`, `thumbnails/`, `hero-banners/`, `chapter-icons/`).
- `content` bucket gated folders (`lessons/`, `materials/`, `notes/`): readable only if the user is enrolled in the related course, or is admin/teacher.
- `lecture-pdfs` and `lesson-attachments`: readable by signed-in users who are enrolled (admin/teacher keep full access).

Result: course thumbnails load in Courses and My Courses instead of the PDF icon. Cards without any uploaded image keep the placeholder — that is correct; the second course ("Knowledge Hub") has no image in the database and needs one uploaded from admin.

## 3. PDF drawer download does nothing

Same root cause: when the drawer's download button asks for a file URL and the storage read is denied, the URL comes back empty and the flow stops. On top of the policy fix:

- Show a clear error toast instead of a silent stop when a file URL cannot be resolved (`AttachmentRow`, `LessonAttachmentsSheet`).
- Make the file-name/extension handling consistent so the saved file always ends in `.pdf`.
- Keep the existing native (app) save path to Documents/Sadguru and the web blob fallback; add a fallback to opening the file in the browser if the save API fails, so a tap never ends with nothing happening.

## 4. Audit

After the fixes, run a review over the changed surface:

- Confirm no policy grants a non-enrolled student access to gated lesson material (attack-simulation query as a student role).
- Confirm no anonymous read is opened on any bucket.
- Verify in the browser that the course cards render real thumbnails and the download flow completes.
- Record findings and a rating in `docs/AUDIT-2026-07-31-storage-images-downloads.md`.

## Technical notes

- Files: `src/components/common/WhatsAppButton.tsx`, `src/components/lesson/AttachmentRow.tsx`, `src/components/lesson/LessonAttachmentsSheet.tsx`, plus one Supabase migration on `storage.objects` policies.
- No changes to enrollment or payment logic; enrollment is only read as a condition for file access.
