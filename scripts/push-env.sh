#!/usr/bin/env bash
# Repush every env var from .env.local to Vercel (production).
# Uses bash `printf` which doesn't append a trailing newline or BOM,
# unlike PowerShell which inserts both. CRON_SECRET and DATABASE_URL
# specifically rejected the PowerShell-piped values.
#
# Run from the lmiros/ directory:  bash scripts/push-env.sh

set -u

ENV_FILE=".env.local"
SKIP_NAMES=("LMIROS_DEV_BYPASS_AUTH")

is_skipped() {
  local name="$1"
  for s in "${SKIP_NAMES[@]}"; do
    [[ "$s" == "$name" ]] && return 0
  done
  return 1
}

while IFS= read -r line || [[ -n "$line" ]]; do
  # trim leading/trailing whitespace + strip BOM if present
  line="${line#$'\xef\xbb\xbf'}"
  line="$(echo -n "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [[ -z "$line" ]] && continue
  [[ "${line:0:1}" == "#" ]] && continue

  name="${line%%=*}"
  value="${line#*=}"

  # strip surrounding double quotes
  if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
    value="${value:1:-1}"
  fi

  if is_skipped "$name"; then
    echo "SKIP $name (in skip list)"
    continue
  fi
  if [[ -z "$value" ]]; then
    echo "SKIP $name (empty value)"
    continue
  fi

  echo "RM/ADD $name"
  vercel env rm "$name" production --yes >/dev/null 2>&1
  printf '%s' "$value" | vercel env add "$name" production 2>&1 | grep -E "Added|Error|error" || true
done < "$ENV_FILE"
