#!/usr/bin/env bash
# Publishes every @tschk package using npm's browser auth (passkey).
# Each publish opens a browser tab to confirm; no codes to type.
#
#   ./scripts/publish-all.sh              publish everything not already current
#   ./scripts/publish-all.sh --dry-run    show the plan, publish nothing
#   ./scripts/publish-all.sh router next  publish only packages matching a name
#   ./scripts/publish-all.sh --help
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
    packages/adapter-react-router
    packages/adapter-tanstack
    packages/adapter-waku
    packages/adapter-conformance
    packages/deploy-bun
    packages/cli
    packages/deploy-cloudflare
    packages/deploy-node
    components
)

SVELTE_DIRS=(
    "$HOME/projects/flowtoken-svelte/packages/flowtoken-svelte"
    "$HOME/projects/svelte-streamdown/packages/svelte-streamdown"
)

dry_run=0
filters=()

for arg in "$@"; do
    case "$arg" in
    --dry-run | -n) dry_run=1 ;;
    --help | -h)
        sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
        exit 0
        ;;
    -*)
        echo "unknown option: $arg (try --help)" >&2
        exit 2
        ;;
    *) filters+=("$arg") ;;
    esac
done

published=0
skipped=0
would=0
failed_names=""
pinned=""

# node rather than the workspace tooling, so this runs from a plain shell
# before any install has happened.
pkg_field() { node -p "require('$1/package.json').$2"; }

# Filters match the package name, not the directory, so `router` finds
# @tschk/moonshine-router wherever it lives.
wanted() {
    [ ${#filters[@]} -eq 0 ] && return 0
    local name="$1" filter
    for filter in "${filters[@]}"; do
        case "$name" in *"$filter"*) return 0 ;; esac
    done
    return 1
}

# One aligned line per outcome, so scanning the run tells you what happened
# without reading prose.
say() { printf '%-9s %s\n' "$1" "$2"; }

publish_dir() {
    local dir="$1"
    local name version

    if [ ! -f "$dir/package.json" ]; then
        say "absent" "$dir (not prepared yet)"
        return 0
    fi
    name=$(pkg_field "$dir" name)
    version=$(pkg_field "$dir" version)

    wanted "$name" || return 0

    if npm view "$name@$version" version >/dev/null 2>&1; then
        # Metadata alone is not proof the version is installable: a publish can
        # register the version and never land its tarball, and npm then answers
        # every query about it happily while `bun install` and `npm install`
        # both 404. Ask for the artifact itself.
        local tarball status
        tarball=$(npm view "$name@$version" dist.tarball 2>/dev/null)
        status=$(curl -sSL -o /dev/null -w '%{http_code}' "$tarball" 2>/dev/null)
        if [ "$status" = "200" ]; then
            say "current" "$name@$version"
            skipped=$((skipped + 1))
            return 0
        fi
        say "BROKEN" "$name@$version — version exists, tarball is HTTP $status" >&2
        echo "   Nobody can install this. npm refuses to republish a version, so either:" >&2
        echo "     npm unpublish $name@$version   # allowed within 72h, then re-run this script" >&2
        echo "   or bump every package to the next version and release again." >&2
        failed_names="$failed_names $name@$version(no-tarball)"
        return 1
    fi

    if [ "$dry_run" = 1 ]; then
        say "would" "$name@$version"
        would=$((would + 1))
        return 0
    fi

    echo
    say "publish" "$name@$version"
    # stdio is inherited so npm can run its browser auth prompt.
    if (cd "$dir" && npm publish --access public --auth-type=web); then
        say "ok" "$name@$version"
        published=$((published + 1))
        return 0
    fi
    say "FAILED" "$name@$version" >&2
    failed_names="$failed_names $name@$version"
    return 1
}

# npm answers E404 for a package you own but are not authenticated to publish,
# so a stale token reads as "no such package" and sends you looking in the
# wrong place. Check before doing any work, and name the cause.
check_auth() {
    [ "$dry_run" = 1 ] && return 0
    local who
    if who=$(npm whoami 2>/dev/null); then
        say "auth" "npm user $who"
        return 0
    fi
    echo "!! Not authenticated to npm." >&2
    echo "   A stale token makes publish fail with a misleading E404. Clear it:" >&2
    echo "     npm config delete //registry.npmjs.org/:_authToken" >&2
    echo "   Then re-run; --auth-type=web opens a browser to confirm." >&2
    exit 1
}

# What is about to be published should be what was tagged. Warnings, not gates:
# republishing from a dirty tree is occasionally the point.
check_release_state() {
    local version head_tag
    version=$(pkg_field "$MOONSHINE" version)
    head_tag=$(cd "$MOONSHINE" && git tag --points-at HEAD 2>/dev/null | head -1)

    if [ -n "$(cd "$MOONSHINE" && git status --porcelain 2>/dev/null)" ]; then
        echo "!! $MOONSHINE is dirty; publishing from an uncommitted tree." >&2
    fi
    if [ -z "$head_tag" ]; then
        echo "!! HEAD is untagged; expected v$version, so the release will have no tag." >&2
    elif [ "$head_tag" != "v$version" ]; then
        echo "!! HEAD is tagged $head_tag but package.json says $version." >&2
    fi
    if [ -n "$(cd "$MOONSHINE" && git log --oneline '@{u}..HEAD' 2>/dev/null)" ]; then
        echo "!! $MOONSHINE has unpushed commits. Push first so the tag exists upstream:" >&2
        echo "     cd $MOONSHINE && git push origin main --follow-tags" >&2
    fi
}

# A package on disk that nobody listed is skipped in silence, and the omission
# only surfaces later as a version that never shipped.
check_for_unlisted_packages() {
    local dir name listed entry
    for dir in "$MOONSHINE"/packages/*/; do
        [ -f "$dir/package.json" ] || continue
        name=$(basename "$dir")
        listed=0
        for entry in "${MOONSHINE_DIRS[@]}"; do
            if [ "$entry" = "packages/$name" ]; then
                listed=1
                break
            fi
        done
        if [ "$listed" = 0 ]; then
            echo "!! packages/$name is not in MOONSHINE_DIRS and will not be published." >&2
            echo "   Add it in dependency order (see scripts/publish.ts)." >&2
        fi
    done
}

if [ "$dry_run" = 1 ]; then
    echo "=== dry run: nothing will be published ==="
else
    check_release_state
fi
check_auth
check_for_unlisted_packages

echo
echo "=== 1/3  @tschk/crepuscularity-wasm ==="
publish_dir "$WASM_DIR"

if wasm_version=$(npm view @tschk/crepuscularity-wasm version 2>/dev/null); then
    # moonshine consumes the parser by path for local dev; that range cannot
    # ship to npm, so point it at the published version first. The range is
    # read back from the registry rather than hardcoded, because a literal
    # here silently downgrades the pin on every run.
    if [ "$dry_run" = 0 ]; then
        for pkg in crepus-moonshine adapter-solid; do
            node -e "
      const fs=require('fs'); const p='$MOONSHINE/packages/$pkg/package.json';
      const d=JSON.parse(fs.readFileSync(p,'utf8'));
      if (d.dependencies && d.dependencies['@tschk/crepuscularity-wasm']) {
        d.dependencies['@tschk/crepuscularity-wasm']='^$wasm_version';
        fs.writeFileSync(p, JSON.stringify(d,null,2)+'\n');
      }
    "
            pinned="$pinned packages/$pkg/package.json"
        done
        say "pinned" "@tschk/crepuscularity-wasm ^$wasm_version"
    fi

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
for d in "${SVELTE_DIRS[@]}"; do
    publish_dir "$d"
done

echo
if [ "$dry_run" = 1 ]; then
    echo "dry run: $would would publish, $skipped already current"
    echo "Re-run without --dry-run to publish."
    exit 0
fi

echo "done: $published published, $skipped already current"

if [ -n "$failed_names" ]; then
    echo "failed:$failed_names" >&2
    # The pin rewrite only makes sense alongside a completed release; leaving it
    # behind after a failure hands you a dirty tree to explain later.
    if [ -n "$pinned" ]; then
        (cd "$MOONSHINE" && git checkout -- $pinned 2>/dev/null) &&
            echo "reverted the crepuscularity-wasm pin: the release did not complete." >&2
    fi
    echo "re-run to retry; anything already published is skipped." >&2
    exit 1
fi

if [ -n "$pinned" ] && [ -n "$(cd "$MOONSHINE" && git status --porcelain $pinned 2>/dev/null)" ]; then
    echo
    echo "The crepuscularity-wasm pin changed. Commit it:"
    echo "  cd $MOONSHINE \\"
    echo "    && git add$(printf ' %s' $pinned) \\"
    echo "    && git commit -m 'chore: depend on the published crepuscularity-wasm' \\"
    echo "    && git push"
fi
