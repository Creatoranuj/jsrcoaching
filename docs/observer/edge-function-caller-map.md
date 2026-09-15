# Edge Function Caller Map

_Generated: 2026-09-07 — `scripts/audit-edge-function-callers.mjs`_

Total functions: **42** — called from UI: **32**, backend-only (expected): **10**, orphaned: **0**

## Orphaned — needs UI or removal (0)

_None._

## Called from UI (32)

- `admin-register` — `src/pages/AdminRegister.tsx`
- `ai-health` — `src/App.tsx`, `src/pages/Admin.tsx`
- `bunny-cdn` — `src/lib/bunnyCdn.ts`
- `chatbot` — `src/App.tsx`, `src/components/Layout/Sidebar.tsx`, `src/components/chat/ChatWidget.tsx`, `src/lib/perf/queryPersister.ts`
- `crawl4ai-bridge` — `src/pages/AdminChatbotSettings.tsx`
- `create-razorpay-order` — `src/pages/BuyCourse.tsx`
- `create-subscription-order` — `src/utils/openSubscriptionCheckout.ts`
- `create-zoom-meeting` — `src/pages/Doubts.tsx`
- `deep-search-lecture` — `src/components/video/VideoSummarizer.tsx`, `src/hooks/useLectureSearch.ts`
- `dependency-scan` — `src/pages/AdminSecurity.tsx`
- `firecrawl-scrape` — `src/pages/AdminChatbotSettings.tsx`
- `generate-embedding` — `src/pages/AdminChatbotSettings.tsx`
- `get-lesson-url` — `src/lib/lessonDownloads.ts`, `src/pages/LessonView.tsx`
- `get-zoom-signature` — `src/components/live/ZoomMeetingEmbed.tsx`
- `import-banner-image` — `src/hooks/useHeroBanners.ts`, `src/hooks/useLandingCourses.ts`
- `initiate-refund` — `src/pages/Admin.tsx`
- `manage-session` — `src/lib/native/sessionTracker.ts`, `src/pages/Admin.tsx`, `src/pages/Settings.tsx`
- `notion-page` — `src/components/video/NotionPageRenderer.tsx`
- `pdf-proxy` — `src/components/course/DocumentReader.tsx`, `src/components/video/PdfViewer.tsx`, `src/lib/fetchDocumentBlob.ts`, `src/lib/linkSources.ts`, `src/lib/pdfViewerUrl.ts`
- `platform-stats` — `src/hooks/usePlatformStats.ts`
- `razorpay-webhook` — `src/hooks/useEnrollmentRecovery.ts`
- `recover-enrollment` — `src/hooks/useEnrollmentArrival.ts`, `src/hooks/useEnrollmentRecovery.ts`, `src/hooks/usePaymentSync.ts`, `src/pages/PaymentCallback.tsx`, `src/utils/paymentApi.ts`
- `request-account-deletion` — `src/pages/DeleteAccountPublic.tsx`, `src/pages/Settings.tsx`
- `resolve-doubt` — `src/components/live/LiveSarthiPanel.tsx`, `src/hooks/useLessonChat.ts`, `src/pages/Doubts.tsx`
- `resolve-storage-pdf` — `src/hooks/usePdfSourceHealth.ts`, `src/lib/native/naveenStoragePdf.ts`, `src/lib/pdfErrorMessage.ts`
- `score-quiz` — `src/pages/QuizAttempt.tsx`
- `self-enroll-free` — `src/hooks/useEnrollments.ts`
- `start-subscription-trial` — `src/utils/openSubscriptionCheckout.ts`
- `summarize-video` — `src/components/lesson/TopicsCovered.tsx`, `src/components/video/VideoSummarizer.tsx`
- `validate-email` — `src/pages/Signup.tsx`
- `verify-razorpay-payment` — `src/hooks/useEnrollmentArrival.ts`, `src/pages/BuyCourse.tsx`, `src/pages/PaymentCallback.tsx`
- `verify-subscription-payment` — `src/utils/openSubscriptionCheckout.ts`

## Backend-only, expected (10)

- `content-redirect`
- `fetch-youtube-transcript`
- `get-video-stream`
- `notify-ai`
- `razorpay-refund-webhook`
- `security-regression`
- `seed-knowledge`
- `send-phone-otp`
- `setup-admin`
- `verify-phone-otp`

_To add an expected backend-only function, extend `BACKEND_ONLY_ALLOWLIST` in the script._
