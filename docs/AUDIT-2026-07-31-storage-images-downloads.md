# Audit — storage reads, course thumbnails, PDF downloads (2026-07-31)

Lens: senior-architect-audit.

## Root cause

The `content`, `lecture-pdfs` and `lesson-attachments` buckets only had admin/teacher
`SELECT` policies on `storage.objects`. Signing a URL as a student failed
("Either the object does not exist or you do not have access to it"), so:

- `CourseCard` / `MyCourses` fell back to `pdf-default.svg` (the red PDF placeholder),
- the attachment drawer resolved a `null` URL and the download stopped silently,
- the in-reader save button fetched a 403 and failed.

Confirmed before the fix: `content/courses/class12-batch-2027.jpg` exists in storage and
is referenced by course 28, yet no policy granted a student read on it.

## Changes

Migration (storage policies, all `TO authenticated` — no anon grant):

| Policy | Scope |
| --- | --- |
| Signed-in read content presentation images | `content` bucket, folders `courses/`, `thumbnails/`, `hero-banners/`, `chapter-icons/` |
| Enrolled read content study files | `content` bucket, folders `lessons/`, `materials/`, `notes/`, gated by `can_read_course_files()` |
| Enrolled read lecture-pdfs | whole bucket, gated |
| Enrolled read lesson-attachments | whole bucket, gated |

`public.can_read_course_files()` is `SECURITY DEFINER`, `search_path = public`,
`EXECUTE` revoked from `PUBLIC`/`anon`, granted to `authenticated`/`service_role`.
It returns true only for admins, teachers, or users with an `active` enrollment.

Frontend:

- `WhatsAppButton.tsx` — number changed to `917388459249`.
- `AttachmentRow.tsx` — explicit toast when a file URL can't be resolved; `.pdf`
  extension normalised; on save failure the file is handed to `openResource`
  instead of dying silently.
- `DocReaderShell.tsx` — same extension normalisation and system-open fallback;
  abort path unchanged (no toast spam on back-navigation).

## Findings

- SEC — no policy is readable by `anon`; verified `roles = {authenticated}` on all four.
  Gated folders still require an active enrollment, so a signed-up-but-unpaid user
  cannot pull lecture PDFs. Payment/enrollment logic untouched.
- SEC — the presentation folders are intentionally readable by any signed-in user;
  they contain marketing thumbnails only (verified: 2 objects, both images).
- RELY — download paths now always end in a toast (success, error, or handoff);
  in-flight aborts still dismiss cleanly, no state left set on unmount.
- UX — files without an extension now save as `.pdf` instead of extension-less blobs.

## Residual risk

- A student enrolled in any one course can read gated files of other courses
  (bucket paths do not encode a course id consistently). Tightening requires a
  path convention (`course-<id>/...`, as `can_access_storage_course` expects) —
  tracked, not shipped here.

Rating: 4/5.
