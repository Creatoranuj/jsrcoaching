# JSR COACHING — Landing Page, Rebrand & Backend Audit

Three pieces of work: bring the new landing page over from your GitHub project, rename the brand to **JSR COACHING** everywhere, and fix the database problems found in the audit. Login, courses, payments, PDFs and admin stay exactly as they are today.

## Audit findings (checked, not guessed)

| # | Severity | Finding |
|---|---|---|
| 1 | Critical | The app code still talks to the **old database** (`xvlvrbpq…`) while the project is now connected to the new one (`wegams…`). Two different databases are in play — that is why several screens misbehave. |
| 2 | High | Tables `hero` and `social_links` **do not exist** in the connected database, but the homepage and admin read/write them. Confirmed against the live table list. |
| 3 | High | The enquiry form writes `name`, `phone`, `source`; the `leads` table only has `student_name`, `email`, `grade`, `user_id`. Phone enquiries cannot be stored today. |
| 4 | Medium | Admin toggles tried to save an `is_public` flag on `site_settings`, which has no such column. Public/private control does not exist for settings. |
| 5 | Medium | Landing sections still point at old brand text and the old project's assets/domains. |

Not changed: roles stay in the separate roles table, no reserved schemas touched, no secrets in tables.

## 1. Point everything at the connected database

- Replace the hardcoded old project URL and key in the app's database connection file with the connected project's values (read from configuration, not pasted).
- Update the remaining files that hardcode the old project reference (PDF link resolver, PDF viewer URL, native PDF loader, PDF health check, `supabase/config.toml`).
- No login, session or permission logic changes.

## 2. Database migration (adds only, nothing dropped)

- **`hero`** — title, subtitle, cta text, cta link, image, active flag, position. Public can read active rows; only admins can change.
- **`social_links`** — platform, url, active flag, position. Public can read active rows; only admins can change.
- **`leads`** — add `phone` and `source`, and make `email` optional so a phone-only enquiry can be saved.
- **`site_settings`** — add `is_public` so admin toggles can mark a setting public.
- Every new table gets access grants, row-level security, and admin-only write policies in the same migration.

## 3. Landing page from your GitHub project

Source: `github.com/Creatoranuj/safarenglishka` (`src/routes/index.tsx`, `JRSMark`, `WhatsAppIcon`, the two homepage images and the gold/navy colour tokens). That project is built on a different framework, so the page is rebuilt section-for-section in this app's setup — same layout, spacing, copy and colours.

Sections, in order:
1. Top contact bar — address + "Admission help: +91 6386474017"
2. Sticky header — JSR mark, nav (About, Courses, Preparation, FAQ, Contact), Login/Signup (or My Courses/Dashboard when signed in), mobile menu
3. Hero — headline, sub-line, WhatsApp and Courses buttons, trust points
4. Programs strip
5. About
6. Courses grid — live rows from the courses table, with the six default programs as fallback (Class 9–12, SSC, Railway)
7. Preparation / Why us, with classroom and mock-test images
8. Results / stats
9. Testimonials
10. FAQ
11. Contact — name, phone, course, message form saving to leads; map, WhatsApp, YouTube links
12. Footer + floating WhatsApp button

Existing routes and pages (`/login`, `/courses`, `/profile`, admin, payments) are untouched; only the homepage is replaced.

Contact details kept as-is: phone/WhatsApp +91 6386474017, that YouTube channel, Ugapur Road address, the Google Maps link.

## 4. Rebrand to JSR COACHING

- "Sadguru" appears in roughly 125 files. Every user-visible occurrence becomes **JSR COACHING** — homepage, header/footer, page titles and descriptions, app manifest, share preview text, notices, emails/templates, docs.
- The reference project writes "JRS" — that is the typo. Everywhere in this app it will be **JSR**.
- Android package id, database names, storage bucket names and existing URLs stay unchanged (renaming them would break installed apps and stored files).
- Colour and font tokens move to the gold-on-navy set from the reference project, applied through the shared design tokens so dark mode keeps working.

## Technical notes

- New homepage lives in `src/pages/Index.tsx` with sections under `src/components/Landing/`; reusable `JSRMark` and `WhatsAppIcon` components added.
- The reference project's oklch tokens (`primary` navy, `gold`, `gold-soft`, `whatsapp`) are translated into `src/index.css` + `tailwind.config.ts` (Tailwind v3 syntax here vs v4 there).
- Homepage images are pulled from the reference repo's asset pointers and re-uploaded as project assets.
- `useHero`, `useSocialLinks` and `SocialLinksManager` go back to the typed client once the tables exist; the temporary untyped escape hatch is removed.
- Enquiry form returns to name + phone once `leads.phone` exists.
- Migration order per new table: create, grant, enable row-level security, add policies.
- Verification: typecheck, build, and a browser pass over the homepage on mobile (411px) and desktop.
