#!/bin/bash
# smoke-test.sh — Post-deploy smoke test for ashcroft.cloud
# Checks: API endpoints return expected status/shape, pages load, CSP covers external domains
#
# Usage: ./smoke-test.sh [--verbose]

set -uo pipefail

BASE="https://ashcroft.cloud"
API_BASE="http://localhost:3456"  # Direct to Express, bypass nginx for auth
VERBOSE="${1:-}"
PASS=0
FAIL=0
WARN=0
FAILURES=()
WARNINGS=()

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_pass() { ((PASS++)); [[ "$VERBOSE" == "--verbose" ]] && echo -e "  ${GREEN}✓${NC} $1"; }
log_fail() { ((FAIL++)); FAILURES+=("$1"); echo -e "  ${RED}✗${NC} $1"; }
log_warn() { ((WARN++)); WARNINGS+=("$1"); echo -e "  ${YELLOW}⚠${NC} $1"; }

# ── Auth: get a token ──────────────────────────────────────────────
echo -e "\n${CYAN}▸ Authenticating...${NC}"
source /home/ashcroft/www/server/.env 2>/dev/null || true
LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"ali@ashcroft.cloud","password":"'"${SMOKE_TEST_PW:-testfail}"'"}')
LOGIN_CODE=$(echo "$LOGIN_RESP" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RESP" | sed '$d')

# Try login, or generate a JWT directly if we have access to the server
COOKIE_JAR=""
if [[ "$LOGIN_CODE" == "200" ]]; then
  COOKIE_JAR=$(mktemp)
  curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"ali@ashcroft.cloud","password":"'"${SMOKE_TEST_PW:-testfail}"'"}' > /dev/null
  AUTH="cookie"
  log_pass "Auth (cookie)"
elif command -v node &>/dev/null && [[ -f /home/ashcroft/www/server/.env ]]; then
  # Generate JWT directly — we're on the server
  SMOKE_TOKEN=$(cd /home/ashcroft/www/server && node -e "
    require('dotenv').config({ debug: false });
    const jwt = require('jsonwebtoken');
    process.stdout.write(jwt.sign({ id: 1, email: 'ali@ashcroft.cloud', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' }));
  " 2>/dev/null | tail -1)
  if [[ -n "$SMOKE_TOKEN" ]]; then
    AUTH="token"
    log_pass "Auth (generated JWT)"
  else
    AUTH=""
    echo -e "  ${YELLOW}⚠ Could not generate JWT — testing public endpoints only${NC}"
  fi
else
  echo -e "  ${YELLOW}⚠ Auth failed ($LOGIN_CODE) — testing public endpoints only${NC}"
  AUTH=""
fi

# ── Helper: test endpoint ──────────────────────────────────────────
check_api() {
  local method="$1" path="$2" expect_code="${3:-200}" expect_field="${4:-}"
  
  local url="$API_BASE$path"
  
  if [[ -n "${SMOKE_TOKEN:-}" ]]; then
    local resp=$(curl -s -w "\n%{http_code}" --cookie "access_token=$SMOKE_TOKEN" -X "$method" "$url")
  elif [[ -n "$COOKIE_JAR" ]]; then
    local resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X "$method" "$url")
  else
    local resp=$(curl -s -w "\n%{http_code}" -X "$method" "$url")
  fi
  
  local code=$(echo "$resp" | tail -1)
  local body=$(echo "$resp" | sed '$d')
  
  if [[ "$code" != "$expect_code" ]]; then
    log_fail "$method $path → $code (expected $expect_code)"
    return
  fi
  
  # Check JSON shape if field specified
  if [[ -n "$expect_field" ]]; then
    if echo "$body" | jq -e "$expect_field" > /dev/null 2>&1; then
      log_pass "$method $path → $code, has $expect_field"
    else
      log_fail "$method $path → $code but missing field: $expect_field"
    fi
  else
    log_pass "$method $path → $code"
  fi
}

check_page() {
  local path="$1"
  local code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [[ "$code" == "200" ]]; then
    log_pass "PAGE $path → $code"
  else
    log_fail "PAGE $path → $code"
  fi
}

# ── PM2 Health Check ───────────────────────────────────────────────
echo -e "\n${CYAN}▸ PM2 health${NC}"
PM2_JSON=$(pm2 jlist 2>/dev/null)
PM2_STATUS=$(echo "$PM2_JSON" | jq -r '.[] | select(.name=="ashcroft-api") | .pm2_env.status' 2>/dev/null)
PM2_RESTARTS=$(echo "$PM2_JSON" | jq -r '.[] | select(.name=="ashcroft-api") | .pm2_env.restart_time' 2>/dev/null)

if [[ "$PM2_STATUS" == "online" ]]; then
  log_pass "PM2 ashcroft-api status: online"
else
  log_fail "PM2 ashcroft-api status: ${PM2_STATUS:-not found} (expected online)"
fi

if [[ -n "$PM2_RESTARTS" ]] && (( PM2_RESTARTS > 5 )); then
  log_warn "PM2 restart count high: $PM2_RESTARTS"
else
  log_pass "PM2 restart count: ${PM2_RESTARTS:-0}"
fi

# ── Server Preflight ──────────────────────────────────────────────
echo -e "\n${CYAN}▸ Server preflight (module resolution)${NC}"
SERVER_JS="/home/ashcroft/www/server/server.js"
MISSING_MODULES=0
while IFS= read -r mod_path; do
  full_path="/home/ashcroft/www/server/${mod_path}"
  # Add .js if no extension
  [[ "$full_path" != *.js ]] && full_path="${full_path}.js"
  if [[ -f "$full_path" ]]; then
    log_pass "Module exists: $mod_path"
  else
    log_fail "Missing module: $mod_path → $full_path"
    ((MISSING_MODULES++))
  fi
done < <(grep -oP "require\('\./\K[^']+(?='\))" "$SERVER_JS" | sort -u)

if (( MISSING_MODULES > 0 )); then
  log_fail "Server has $MISSING_MODULES missing module(s) — would crash on startup"
fi

# ── Public endpoints ───────────────────────────────────────────────
echo -e "\n${CYAN}▸ Public endpoints${NC}"
# Test unauthenticated access is rejected
UNAUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/api/auth/me")
if [[ "$UNAUTH_CODE" == "401" ]]; then log_pass "GET /api/auth/me (no auth) → 401"; else log_fail "GET /api/auth/me (no auth) → $UNAUTH_CODE (expected 401)"; fi
check_page /
check_page /app/login.html

# ── Authenticated API endpoints ────────────────────────────────────
if [[ -n "$AUTH" ]]; then
  echo -e "\n${CYAN}▸ Auth endpoints${NC}"
  check_api GET /api/auth/me 200 '.user.email'

  echo -e "\n${CYAN}▸ Tasks${NC}"
  check_api GET /api/task-lists 200 'type == "array"'
  check_api GET /api/tasks 200 'type == "array"'

  echo -e "\n${CYAN}▸ Events${NC}"
  check_api GET /api/events 200 'type == "array"'

  echo -e "\n${CYAN}▸ Grocery${NC}"
  check_api GET /api/grocery-items 200

  echo -e "\n${CYAN}▸ Notes${NC}"
  check_api GET /api/notes 200

  echo -e "\n${CYAN}▸ Kanban${NC}"
  check_api GET /api/kanban/boards 200 'type == "array"'

  echo -e "\n${CYAN}▸ Garden${NC}"
  check_api GET /api/garden/plants 200
  check_api GET /api/garden/supplies 200
  check_api GET /api/garden/product-catalog 200

  echo -e "\n${CYAN}▸ Captures${NC}"
  check_api GET /api/captures 200

  echo -e "\n${CYAN}▸ Travel${NC}"
  check_api GET /api/travel/trips 200

  echo -e "\n${CYAN}▸ Sports${NC}"
  check_api GET /api/sports/football/live 200
  check_api GET /api/sports/cricket/live 200
  check_api GET /api/sports/tennis/rankings 200
  check_api GET /api/sports/f1/calendar 200

  echo -e "\n${CYAN}▸ App pages${NC}"
  for page in dashboard tasks events grocery notes kanban garden captures sports travel settings; do
    check_page "/app/${page}.html"
  done
fi

# ── CSP Validation ─────────────────────────────────────────────────
echo -e "\n${CYAN}▸ CSP validation${NC}"

# Fetch CSP header
CSP_HEADER=$(curl -sI "$BASE/app/dashboard.html" | grep -i "content-security-policy" | head -1 | sed 's/.*: //')

if [[ -z "$CSP_HEADER" ]]; then
  log_fail "No CSP header found"
else
  log_pass "CSP header present"
  
  # Extract external domains from img src, fetch(), and tile URL patterns (not href/attribution)
  EXTERNAL_DOMAINS=$(grep -roh 'https://[a-zA-Z0-9.*-]*\.[a-zA-Z0-9.]*' /home/ashcroft/www/app/*.html /home/ashcroft/www/app/js/*.js 2>/dev/null \
    | sed 's|https://||' \
    | sort -u \
    | grep -v 'ashcroft.cloud\|unpkg.com\|leafletjs.com\|openstreetmap.org/copyright\|maps.google.com\|carto.com$\|github.com\|fonts.googleapis.com\|fonts.gstatic.com' \
    || true)

  for domain in $EXTERNAL_DOMAINS; do
    # Check if domain or its wildcard parent is in CSP
    if echo "$CSP_HEADER" | grep -qi "$domain"; then
      log_pass "CSP covers $domain"
    else
      # Check wildcard match (*.example.com)
      parent=$(echo "$domain" | sed 's/^[^.]*\.//')
      if echo "$CSP_HEADER" | grep -qi "\*\.$parent"; then
        log_pass "CSP covers $domain (via wildcard)"
      else
        log_warn "CSP may not cover: $domain"
      fi
    fi
  done
fi

# ── F1 Response Shape Validation ───────────────────────────────────
if [[ -n "$AUTH" ]]; then
  echo -e "\n${CYAN}▸ F1 API shape validation${NC}"
  
  AUTH_CURL_F1=()
  [[ -n "${SMOKE_TOKEN:-}" ]] && AUTH_CURL_F1=(--cookie "access_token=$SMOKE_TOKEN")
  [[ -n "${COOKIE_JAR:-}" ]] && AUTH_CURL_F1=(-b "$COOKIE_JAR")
  
  # F1 Drivers standings
  F1_DRV=$(curl -s "${AUTH_CURL_F1[@]}" "$API_BASE/api/sports/f1/standings/drivers")
  if echo "$F1_DRV" | jq -e '.data[0] | .driver.name and .constructor and .position and .points' > /dev/null 2>&1; then
    log_pass "F1 drivers shape: driver.name, constructor, position, points ✓"
  elif echo "$F1_DRV" | jq -e '.data | length == 0' > /dev/null 2>&1; then
    log_pass "F1 drivers shape: empty data"
  else
    log_fail "F1 drivers shape invalid — $(echo "$F1_DRV" | jq '.data[0] | keys' 2>/dev/null || echo 'not JSON')"
  fi

  # F1 Constructors standings
  F1_CON=$(curl -s "${AUTH_CURL_F1[@]}" "$API_BASE/api/sports/f1/standings/constructors")
  if echo "$F1_CON" | jq -e '.data[0] | .constructor.name and .position and .points' > /dev/null 2>&1; then
    log_pass "F1 constructors shape: constructor.name, position, points ✓"
  elif echo "$F1_CON" | jq -e '.data | length == 0' > /dev/null 2>&1; then
    log_pass "F1 constructors shape: empty data"
  else
    log_fail "F1 constructors shape invalid — $(echo "$F1_CON" | jq '.data[0] | keys' 2>/dev/null || echo 'not JSON')"
  fi

  # F1 Calendar
  F1_CAL=$(curl -s "${AUTH_CURL_F1[@]}" "$API_BASE/api/sports/f1/calendar")
  if echo "$F1_CAL" | jq -e '.data[0] | .round and .name and .date' > /dev/null 2>&1; then
    log_pass "F1 calendar shape: round, name, date ✓"
  elif echo "$F1_CAL" | jq -e '.[0] | .round and .name and .date' > /dev/null 2>&1; then
    log_pass "F1 calendar shape: round, name, date ✓ (array)"
  elif echo "$F1_CAL" | jq -e '.data | length == 0' > /dev/null 2>&1; then
    log_pass "F1 calendar shape: empty data"
  else
    log_fail "F1 calendar shape invalid — $(echo "$F1_CAL" | jq '.[0] // .data[0] | keys' 2>/dev/null || echo 'not JSON')"
  fi
fi

# ── Garden Photo Validation ────────────────────────────────────────
if [[ -n "$AUTH" ]]; then
  echo -e "\n${CYAN}▸ Garden photo validation${NC}"
  
  AUTH_CURL_G=()
  [[ -n "${SMOKE_TOKEN:-}" ]] && AUTH_CURL_G=(--cookie "access_token=$SMOKE_TOKEN")
  [[ -n "${COOKIE_JAR:-}" ]] && AUTH_CURL_G=(-b "$COOKIE_JAR")
  
  PLANTS_RESP=$(curl -s "${AUTH_CURL_G[@]}" "$API_BASE/api/garden/plants")
  
  # Check photo URL fields exist
  if echo "$PLANTS_RESP" | jq -e '.[0] | has("latest_photo_url", "latest_thumbnail_url")' > /dev/null 2>&1; then
    log_pass "Garden plants have latest_photo_url, latest_thumbnail_url"
  elif echo "$PLANTS_RESP" | jq -e 'length == 0' > /dev/null 2>&1; then
    log_pass "Garden plants: empty (no data)"
  else
    log_fail "Garden plants missing latest_photo_url or latest_thumbnail_url fields"
  fi

  # Check photo files exist on disk
  PHOTO_URLS=$(echo "$PLANTS_RESP" | jq -r '.[].latest_photo_url // empty, .[].latest_thumbnail_url // empty' 2>/dev/null | sort -u | grep -v '^null$' || true)
  for url in $PHOTO_URLS; do
    # Convert URL path to disk path
    disk_path="/home/ashcroft/www/public${url}"
    if [[ ! -f "$disk_path" ]]; then
      # Try app directory
      disk_path2="/home/ashcroft/www${url}"
      if [[ -f "$disk_path2" ]]; then
        disk_path="$disk_path2"
      else
        log_fail "Garden photo missing on disk: $url"
        continue
      fi
    fi
    if [[ -r "$disk_path" ]]; then
      log_pass "Garden photo readable: $(basename "$url")"
    else
      log_fail "Garden photo not readable: $disk_path"
    fi
  done
fi

# ── File Permission Checks ────────────────────────────────────────
echo -e "\n${CYAN}▸ File permission checks${NC}"
PERM_FAIL=0
for upload_dir in /home/ashcroft/www/public/uploads /home/ashcroft/www/app/uploads; do
  [[ ! -d "$upload_dir" ]] && continue
  while IFS= read -r file; do
    perms=$(stat -c '%a' "$file" 2>/dev/null)
    # Check if group/others can read (at least 644)
    if (( (0$perms & 044) != 044 )); then
      log_fail "Restrictive permissions ($perms) on: $file"
      ((PERM_FAIL++))
    fi
  done < <(find "$upload_dir" -type f 2>/dev/null)
done
if (( PERM_FAIL == 0 )); then
  log_pass "All upload files have readable permissions"
fi

# ── API Response Shape Validation ──────────────────────────────────
# Check that key list endpoints return arrays with expected fields
if [[ -n "$AUTH" ]]; then
  echo -e "\n${CYAN}▸ Response shape validation${NC}"
  
  AUTH_CURL=()
  [[ -n "${SMOKE_TOKEN:-}" ]] && AUTH_CURL=(--cookie "access_token=$SMOKE_TOKEN")
  [[ -n "${COOKIE_JAR:-}" ]] && AUTH_CURL=(-b "$COOKIE_JAR")
  
  # Check captures response has expected fields (may be { captures: [...] } or [...])
  CAPTURES=$(curl -s "${AUTH_CURL[@]}" "$API_BASE/api/captures?limit=1")
  FIRST_CAP=$(echo "$CAPTURES" | jq -e '.captures[0] // .[0]' 2>/dev/null)
  if echo "$FIRST_CAP" | jq -e 'has("id", "title", "body", "type", "captured_at")' > /dev/null 2>&1; then
    log_pass "Captures shape: id, title, body, type, captured_at ✓"
  elif [[ "$FIRST_CAP" == "null" ]] || [[ -z "$FIRST_CAP" ]]; then
    log_pass "Captures shape: empty (no data to validate)"
  else
    log_warn "Captures shape unexpected — $(echo "$FIRST_CAP" | jq 'keys' 2>/dev/null)"
  fi

  # Check garden plants response
  PLANTS=$(curl -s "${AUTH_CURL[@]}" "$API_BASE/api/garden/plants")
  if echo "$PLANTS" | jq -e '.[0] | has("id", "name", "type")' > /dev/null 2>&1; then
    log_pass "Garden plants shape: id, name, type ✓"
  elif echo "$PLANTS" | jq -e 'length == 0' > /dev/null 2>&1; then
    log_pass "Garden plants shape: empty (no data)"
  else
    log_warn "Plants shape unexpected — $(echo "$PLANTS" | jq '.[0] | keys' 2>/dev/null)"
  fi

  # Check travel trips response
  TRIPS=$(curl -s "${AUTH_CURL[@]}" "$API_BASE/api/travel/trips")
  if echo "$TRIPS" | jq -e '.[0] | has("id", "title", "destination")' > /dev/null 2>&1; then
    log_pass "Travel trips shape: id, title, destination ✓"
  elif echo "$TRIPS" | jq -e 'length == 0' > /dev/null 2>&1; then
    log_pass "Travel trips shape: empty (no data)"
  else
    log_warn "Trips shape unexpected — $(echo "$TRIPS" | jq '.[0] | keys' 2>/dev/null)"
  fi
fi

# ── Summary ────────────────────────────────────────────────────────
echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}✓ $PASS passed${NC}  ${RED}✗ $FAIL failed${NC}  ${YELLOW}⚠ $WARN warnings${NC}"

if [[ $FAIL -gt 0 ]]; then
  echo -e "\n${RED}Failures:${NC}"
  for f in "${FAILURES[@]}"; do echo -e "  ${RED}✗${NC} $f"; done
fi
if [[ $WARN -gt 0 ]]; then
  echo -e "\n${YELLOW}Warnings:${NC}"
  for w in "${WARNINGS[@]}"; do echo -e "  ${YELLOW}⚠${NC} $w"; done
fi

# Cleanup
[[ -n "${COOKIE_JAR:-}" ]] && rm -f "$COOKIE_JAR"

echo ""
exit $FAIL
