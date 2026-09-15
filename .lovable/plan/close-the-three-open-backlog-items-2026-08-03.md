# Close the three open backlog items

From `docs/AUDIT-2026-08-03-payments-askdoubt-crash.md`. All three are small, contained changes.

## 1. Partial refunds

Today `initiate-refund` always refunds the full payment and always revokes course access.

Change:
- Accept an optional refund amount (in paise) in the request. No amount = full refund, exactly as today.
- Validate it: positive integer, not larger than the recorded payment amount.
- Pass it to Razorpay so it issues a partial refund.
- Only a full refund flips the payment to "refunded" and revokes enrollment. A partial refund leaves access intact and records the refund separately.
- Admin UI: add an optional amount field to the existing refund confirmation dialog, blank = full refund, with a clear line telling the admin that a partial refund does not remove course access.

Needs one database migration: the refund routine currently only takes an order id, so it gains an amount/full-refund parameter and stops revoking enrollment on partial refunds.

## 2. Dedicated refund audit trail

Right now the only trace of a refund is the generic row written inside the refund routine.

Change: `initiate-refund` writes its own audit row after Razorpay confirms, recording which admin acted, the order and payment ids, the Razorpay refund id, the amount, and whether it was full or partial. Failures to write the audit row are logged, never fail the refund.

## 3. Consolidate the PDF stall watchdogs

`FastPdfReader.tsx` runs three overlapping timers (archive range-stall interval, stream-stall interval, hard 15s mount timeout), each re-created whenever `progress` changes — so the timers restart constantly during a healthy download and the two byte-fallback triggers can race.

Change: replace them with one watchdog effect that ticks on a single interval and decides what to do from the current state (archive vs. normal source, time since last progress, whether a fallback already ran). Same thresholds, same behaviour, one owner, and it no longer depends on `progress` so it stops churning. `Doubts.tsx` has no timer of its own — the audit note was inaccurate, so nothing to change there.

## Technical notes

- Files: `supabase/functions/initiate-refund/index.ts`, `src/pages/Admin.tsx`, `src/components/video/FastPdfReader.tsx`, plus one migration for `public.process_refund`.
- Progress/last-progress tracking already lives in refs, so the merged watchdog reads them without re-subscribing.
- Verification: typecheck, run the existing test suite, and redeploy `initiate-refund`.
