#!/usr/bin/env bash
# Local developer setup for moonshine (+ optional crepus sibling).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> local moonshine setup"

command -v bun >/dev/null || { echo "install bun: https://bun.sh"; exit 1; }
bun install
bun run check

if command -v dart >/dev/null; then
  (cd dart/moonshine_jaspr && dart pub get && dart test)
fi

MARKER="# moonshine MOONSHINE_PATH"
EXPORT_LINE="export MOONSHINE_PATH=\"$ROOT\""
for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
  touch "$rc"
  if ! grep -qF "$MARKER" "$rc" 2>/dev/null; then
    {
      echo ""
      echo "$MARKER"
      echo "$EXPORT_LINE"
    } >> "$rc"
    echo "appended MOONSHINE_PATH to $rc"
  else
    echo "MOONSHINE_PATH already configured in $rc"
  fi
done

export MOONSHINE_PATH="$ROOT"
echo "MOONSHINE_PATH=$MOONSHINE_PATH"
echo "==> done. Open a new shell or: source ~/.zshrc"
echo "    crepus moonshine new my-app"
