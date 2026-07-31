#!/usr/bin/env bash
# Publishes every @tschk package using npm's browser auth (passkey).
# Each publish opens a browser tab to confirm; no codes to type.
set -uo pipefail

CREPUS="$HOME/projects/crepuscularity"
MOONSHINE="$HOME/projects/moonshine"
WASM_DIR="$CREPUS/crates/crepuscularity-wasm/npm"

# Dependency-first, as computed by scripts/publish.ts.
MOONSHINE_DIRS=(
    packages/framework
    packages/react
    packages/server
    packages/shaders
    packages/core
    packages/router
    packages/crepus-moonshine
    packages/adapter-solid
    packages/compiler
    packages/deploy-vercel
    packages/adapter-next
    packages/adapter-conformance
    packages/deploy-bun
    packages/cli
    packages/deploy-cloudflare
    packages/deploy-node
    components
)

published=0
skipped=0
failed=()

publish_dir() {
    local dir="$1"
    local name version

    if [ ! -f "$dir/package.json" ]; then
        echo "skip      $dir (not prepared yet)"
        return 0
    fi
    name=$(node -p "require('$dir/package.json').name")
    version=$(node -p "require('$dir/package.json').version")

    if npm view "$name@$version" version >/dev/null 2>&1; then
        echo "skip      $name@$version (already on npm)"
        skipped=$((skipped + 1))
        return 0
    fi

    echo
    echo ">>> publishing $name@$version"
    # stdio is inherited so npm can run its browser auth prompt.
    if (cd "$dir" && npm publish --access public --auth-type=web); then
        echo "published $name@$version"
        published=$((published + 1))
        return 0
    fi
    echo "FAILED    $name@$version" >&2
    failed+=("$name@$version")
    return 1
}

echo "=== 1/3  @tschk/crepuscularity-wasm ==="
publish_dir "$WASM_DIR"

if npm view @tschk/crepuscularity-wasm version >/dev/null 2>&1; then
    # moonshine consumes the parser by path for local dev; that range cannot
    # ship to npm, so point it at the published version first.
    for pkg in crepus-moonshine adapter-solid; do
        node -e "
      const fs=require('fs'); const p='$MOONSHINE/packages/$pkg/package.json';
      const d=JSON.parse(fs.readFileSync(p,'utf8'));
      if (d.dependencies && d.dependencies['@tschk/crepuscularity-wasm']) {
        d.dependencies['@tschk/crepuscularity-wasm']='^0.1.0';
        fs.writeFileSync(p, JSON.stringify(d,null,2)+'\n');
      }
    "
    done

    echo
    echo "=== 2/3  moonshine (${#MOONSHINE_DIRS[@]} packages) ==="
    for d in "${MOONSHINE_DIRS[@]}"; do
        publish_dir "$MOONSHINE/$d"
    done
else
    echo "!! @tschk/crepuscularity-wasm is not on npm; skipping moonshine" >&2
fi

echo
echo "=== 3/3  svelte packages ==="
publish_dir "$HOME/projects/flowtoken-svelte/packages/flowtoken-svelte"
publish_dir "$HOME/projects/svelte-streamdown/packages/svelte-streamdown"

echo
echo "done: $published published, $skipped already current"
if [ ${#failed[@]} -gt 0 ]; then
    echo "failed: ${failed[*]}" >&2
    echo "re-run this script to retry; anything already published is skipped." >&2
    exit 1
fi
echo
echo "Then let me commit the dependency-range change, or run:"
echo "  cd $MOONSHINE && git add -A packages && git commit -m 'chore: depend on the published crepuscularity-wasm' && git push"
