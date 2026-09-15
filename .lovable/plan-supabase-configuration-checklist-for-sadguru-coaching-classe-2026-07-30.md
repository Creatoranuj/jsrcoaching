# Supabase Configuration Checklist for Sadguru Coaching Classes

This plan covers the manual checks and settings you need to apply directly in the Supabase dashboard for the migrated project (`xvlvrbpqxqqqaeihofod`).

## 1. Edge Functions secrets

Go to: Supabase Dashboard → Project Settings → Functions → Secrets

Verify these keys are present and match the correct values:

- `RAZORPAY_KEY_ID` — from Razorpay Dashboard → API Keys
- `RAZORPAY_KEY_SECRET` — from Razorpay Dashboard → API Keys
- `RAZORPAY_WEBHOOK_SECRET` — from Razorpay Dashboard → Webhooks → generated secret
- `SUPABASE_SERVICE_ROLE_KEY` — auto-managed by the Supabase connection; confirm it is set
- `SUPABASE_URL` — `https://xvlvrbpqxqqqaeihofod.supabase.co`
- `SUPABASE_ANON_KEY` — same as `VITE_SUPABASE_PUBLISHABLE_KEY`
- `LOVABLE_API_KEY` — auto-provisioned
- `ADMIN_EMAIL` — the email that should receive admin role on signup
- `ADMIN_PASSWORD` — optional, only if your app uses seeded admin login

## 2. Razorpay webhook

In Razorpay Dashboard → Account & Settings → Webhooks:

- Add endpoint URL: `https://xvlvrbpqxqqqaeihofod.supabase.co/functions/v1/razorpay-webhook`
- Set the secret to the value stored in `RAZORPAY_WEBHOOK_SECRET`
- Enable events:
  - `payment.captured`
  - `refund.processed`
  - `payment.failed` (optional but useful for fraud detection)

## 3. Authentication providers

Go to Supabase Dashboard → Authentication → Providers:

- Enable Email/Password (default)
- Enable Phone/OTP if your app uses mobile login
- Enable Google OAuth if needed, and paste the Google Client ID / Secret
- Under Authentication → URL Configuration, add your site URL:
  - `https://id-preview--932ce678-63e9-4f35-b307-d749fcd177ce.lovable.app`
  - After publish, add your published domain too

## 4. Storage buckets and RLS

Current buckets already exist: `avatars`, `content`, `course-videos`, `course-materials`, `receipts`, `comment-images`, `chat-attachments`, `book-covers`, `lecture-pdfs`, `lesson-attachments`, `notices`, `pdf-cache`, `student-notes`, `study-materials`.

Verify public/private status:

- Public: `avatars`, `content`, `book-covers`, `comment-images`, `chat-attachments`
- Private: `course-videos`, `course-materials`, `receipts`, `lecture-pdfs`, `lesson-attachments`, `notices`, `pdf-cache`, `student-notes`, `study-materials`

If any bucket is misconfigured, update it via Storage → Buckets → Policies.

## 5. Database functions and RLS

Verify these critical functions exist in the Database → Functions section:

- `has_role`, `get_user_role`, `handle_new_user`, `handle_new_user_role`
- `assign_admin_on_signup`
- `create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook`, `initiate-refund`
- `check_rate_limit`, `process_refund`
- `get_dashboard_snapshot`, `get_course_bundle`, `search_lectures`
- `admin_get_batch_roster`, `admin_get_suspicious_enrollments`, `admin_set_user_block`, `admin_hide_content`, `admin_revoke_enrollment`, `admin_mark_enrollment_legit`, `admin_resolve_report`, `admin_get_user_snapshot`

Verify RLS is enabled on all user-facing tables and that policies are in place for `profiles`, `enrollments`, `razorpay_payments`, `user_roles`, `user_subscriptions`, `payment_requests`, `messages`, `deletion_requests`, and `content_reports`.

## 6. Site settings

Run this SQL in Supabase SQL Editor or set the row manually:

```text
INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('admin_email', 'your-admin-email@example.com', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

Replace `your-admin-email@example.com` with the real admin email.

This drives `assign_admin_on_signup()` so the first admin account is created automatically.

## 7. Smoke test

After the above is done:

- Open the app preview and sign up a test user with the admin email
- Confirm the user gets the `admin` role in `public.user_roles`
- Try to create a Razorpay test order on a paid course and verify it returns an `order_id` starting with `order_`
- Confirm the webhook dashboard shows the webhook as active

## 8. Optional: Google Play / App Store links

If you are releasing the Android app, set `min_android_version`, `android_store_url`, and `ios_store_url` in `public.app_config` so in-app update prompts work correctly.
