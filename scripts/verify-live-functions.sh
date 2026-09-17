#!/usr/bin/env bash
# Post-deploy health gate for the Supabase Edge Functions.
#
# Verifies, against the LIVE deployment:
#   1. the live website origin is allowed (exact echo)
#   2. an unknown origin gets NO Access-Control-Allow-Origin header
#   3. no wildcard ACAO anywhere
#   4. razorpay-webhook rejects a bad signature (400)
#   5. create-razorpay-order rejects a bogus token (401)
#   6. malformed JSON is rejected before parsing (4xx)
#   7. send-phone-otp throttle is fail-closed (429 after N attempts)  [optional: SKIP_OTP=1]
#   8. ai-health returns {"ok":true}
#   9. platform-stats returns 200
#
# Usage:
#   SUPABASE_PROJECT_REF=xxxx SUPABASE_ANON_KEY=yyyy ./scripts/verify-live-functions.sh
set -uo pipefail

REF="${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required}"
ANON="${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required}"
BASE="https://${REF}.supabase.co/functions/v1"
SITE="${SITE_ORIGIN:-https://jsrcoaching.vercel.app}"
EVIL="https://evil-example-not-allowed.com"

fails=0
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; fails=$((fails + 1)); }

acao() { # $1=origin $2=function
  curl -sS -X OPTIONS "$BASE/$2" \
    -H "Origin: $1" \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: authorization, content-type' \
    -D - -o /dev/null 2>/dev/null \
    | tr -d '\r' | awk 'tolower($1)=="access-control-allow-origin:"{print $2}' | head -1
}

status() { # $1=function $2=body $3..=extra curl args
  local fn="$1" body="$2"; shift 2
  curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/$fn" \
    -H "Origin: $SITE" -H 'Content-Type: application/json' \
    -H "apikey: $ANON" "$@" --data "$body"
}

echo "== CORS =="
got="$(acao "$SITE" create-razorpay-order)"
[ "$got" = "$SITE" ] && pass "live origin echoed ($got)" || fail "live origin: expected $SITE, got '${got:-none}'"

got="$(acao "$EVIL" create-razorpay-order)"
[ -z "$got" ] && pass "unknown origin gets no allow header" || fail "unknown origin got ACAO '$got'"

got="$(acao "$SITE" send-phone-otp)"
[ "$got" != '*' ] && pass "no wildcard ACAO" || fail "wildcard ACAO returned"

echo "== Payments =="
code="$(status razorpay-webhook '{"event":"payment.captured"}' -H 'x-razorpay-signature: deadbeef')"
[ "$code" = "400" ] && pass "webhook bad signature -> 400" || fail "webhook bad signature -> $code (want 400)"

code="$(status create-razorpay-order '{"course_id":1}' -H 'Authorization: Bearer not-a-real-token')"
[ "$code" = "401" ] && pass "order without valid auth -> 401" || fail "order bogus auth -> $code (want 401)"

code="$(status create-razorpay-order '{not json' -H 'Authorization: Bearer not-a-real-token')"
case "$code" in 4*) pass "malformed body -> $code";; *) fail "malformed body -> $code (want 4xx)";; esac

echo "== OTP throttle (fail-closed) =="
if [ "${SKIP_OTP:-0}" = "1" ]; then
  echo "  SKIP  OTP throttle (SKIP_OTP=1)"
else
  seen429=0
  for _ in 1 2 3 4 5; do
    c="$(status send-phone-otp '{"phone":"+919999999999"}')"
    [ "$c" = "429" ] && seen429=1 && break
  done
  [ "$seen429" = "1" ] && pass "throttle reached 429" || fail "throttle never returned 429"
fi

echo "== Health =="
body="$(curl -sS "$BASE/ai-health" -H "apikey: $ANON" -H "Origin: $SITE")"
case "$body" in *'"ok":true'*) pass "ai-health ok";; *) fail "ai-health: $body";; esac

code="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/platform-stats" -H "apikey: $ANON" -H "Origin: $SITE")"
[ "$code" = "200" ] && pass "platform-stats 200" || fail "platform-stats -> $code"

echo
if [ "$fails" -gt 0 ]; then
  echo "FAILED: $fails check(s)"; exit 1
fi
echo "All live function checks passed."
