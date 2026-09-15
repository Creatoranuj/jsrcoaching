# Fix: homepage not loading

## What's actually happening

The homepage code is fine — it builds cleanly and renders fully when loaded directly. The problem is that its **data requests to the database are being rejected**, so the banner, courses and testimonials sections fail and the app's recovery logic triggers a reload.

Confirmed from the live request log:

```text
GET /rest/v1/hero                  -> 401  "permission denied for function has_role"
GET /rest/v1/landing_testimonials  -> 401  "permission denied for function has_role"
```

Root cause (verified against the database): the permission-check helper `has_role` can be executed by signed-in users and the service role, but **not by signed-out visitors**. Every rule on these tables calls that helper, so for a visitor who is not logged in the whole request errors out instead of just returning the public rows.

This affects every public page that reads a protected table while logged out — not just the homepage.

## The fix

1. Allow signed-out visitors to run the permission-check helper (it only ever returns true/false; it exposes no data).
2. Re-check the rules on the homepage tables (banner, social links, courses, testimonials) so a signed-out visitor can read the active rows and nothing else.
3. Reload the homepage signed-out and confirm no rejected requests remain.

## Technical notes

- Migration: `GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;`
- Audit `pg_policies` for `hero`, `social_links`, `landing_courses`, `landing_testimonials`: confirm each has a `SELECT ... TO anon, authenticated USING (is_active)` policy alongside the admin-only write policies, and add any that is missing (with matching `GRANT SELECT ... TO anon`).
- No application code changes expected. Verification: signed-out Playwright pass at 411px and 1280px capturing all non-2xx responses.
- Unrelated console noise seen while checking (`Function components cannot be given refs` warnings from `ContactLink`, `EnquiryForm`, `JSRMark`, `WhatsAppIcon`) is harmless and out of scope unless you want it cleaned up.
