#!/usr/bin/env bash
# Publieke smoke-check voor SenseCorner (geen login, geen writes, geen user-RPC).
# Gebruik: ./scripts/smoke-public.sh
# Optioneel: BASE_URL=https://sensecorner.com ./scripts/smoke-public.sh

set -euo pipefail

BASE_URL="${BASE_URL:-https://sensecorner.com}"
UA="${SMOKE_UA:-Mozilla/5.0 (compatible; SenseCornerSmoke/1.0)}"
FAIL=0

check_page() {
  local path="$1"
  local expect_substr="$2"
  local url="${BASE_URL%/}/${path#/}"
  local tmp
  tmp="$(mktemp)"
  local code
  code="$(curl -sS -L --connect-timeout 15 --max-time 45 \
    -A "$UA" -o "$tmp" -w "%{http_code}" "$url" || echo "000")"

  if [[ "$code" != "200" ]]; then
    echo "FAIL  HTTP $code  $url"
    FAIL=1
    rm -f "$tmp"
    return
  fi

  if ! grep -q "$expect_substr" "$tmp"; then
    echo "FAIL  missing «${expect_substr}»  $url"
    FAIL=1
    rm -f "$tmp"
    return
  fi

  echo "OK    HTTP $code  $url"
  rm -f "$tmp"
}

echo "SenseCorner public smoke"
echo "BASE_URL=$BASE_URL"
echo "----"

check_page "index.html" "SenseCorner"
check_page "" "SenseCorner"
check_page "sensecorner.html" "SenseCorner"
check_page "onboarding.html" "Kennismaking"
check_page "privacy.html" "Privacy"
check_page "voorwaarden.html" "voorwaarden"
check_page "ai-disclaimer.html" "AI"
check_page "datesense.html" "DateSense"
check_page "ownsense.html" "OWN Sense"

echo "----"
if [[ "$FAIL" -ne 0 ]]; then
  echo "RESULT: FAILED"
  exit 1
fi
echo "RESULT: PASSED"
exit 0
