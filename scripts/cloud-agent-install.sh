#!/usr/bin/env bash
# Idempotent Cloud Agent / local bootstrap for tschk/moonshine.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> moonshine bootstrap ($ROOT)"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required" >&2
  exit 1
fi

bun install --frozen-lockfile || bun install

bun run check:catalog
bun test
bun run typecheck

if command -v dart >/dev/null 2>&1; then
  (
    cd dart/moonshine_jaspr
    dart pub get
    dart analyze --fatal-infos || dart analyze
    dart test
  )
else
  echo "warn: dart not installed — skipping moonshine_jaspr"
fi

# Optional sibling crepuscularity for emit/scaffold smoke.
if [[ -d ../crepuscularity ]]; then
  export MOONSHINE_PATH="$ROOT"
  echo "MOONSHINE_PATH=$MOONSHINE_PATH"
fi

echo "==> moonshine bootstrap ok"
