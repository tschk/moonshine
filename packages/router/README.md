# `@tschk/moonshine-router`

Use the neutral subpaths without installing React:

```ts
import { createRouteGraph, matchRoutes } from "@tschk/moonshine-router/graph";
import {
  createMoonshineRouter,
  splitLocation,
} from "@tschk/moonshine-router/runtime";
```

The graph provides pattern matching, ambiguity detection, and precedence:
`static > dynamic > optional > rest`. The browser runtime provides isolated
location and history signals, push/replace navigation, and explicit browser
history synchronization. Relative destinations resolve against the owning
runtime's current location. Location signals contain pathname and query;
fragments are passed to browser history. It does not fetch route data or mount
page components.

```ts
const router = createMoonshineRouter();
const output = document.querySelector("output")!;
const update = () => {
  output.textContent = router.getLocation();
};
const unsubscribe = router.location.subscribe(update);
const sync = () => router.syncFromBrowser();
window.addEventListener("popstate", sync);
update();

router.navigate("/counter?start=2", { state: { from: "home" } });

// When this app is removed:
unsubscribe();
window.removeEventListener("popstate", sync);
```

The package root retains React navigation exports and requires React installed.
Existing React imports remain supported:

```ts
import {
  MoonshineRouter,
  Link,
  useParams,
  useNavigate,
} from "@tschk/moonshine-router";
```

See [docs/ROUTING.md](../../docs/ROUTING.md).

Each router runtime owns a `fragment` signal containing its current hash,
including `#`. Navigation and browser synchronization update it alongside
history and location. `getLocation()` and `location` retain pathname plus query
only. An explicit initial URL supplies its own fragment; the default runtime
starts from the browser URL.

## Opt-in client data

`@tschk/moonshine-router/data` adds loading and mutation ownership without React
or a host router. It does not import server route modules into the browser.
Supply client-safe operations, such as requests to your existing API routes:

```ts
import { createDataRouter } from "@tschk/moonshine-router/data";

const router = createDataRouter(async ({ location, signal }) => {
  const response = await fetch(
    `/api/page?path=${encodeURIComponent(location)}`,
    {
      signal,
    },
  );
  if (!response.ok) throw new Error(`Load failed: ${response.status}`);
  return response.json();
}, "/");

const unsubscribe = router.data.subscribe(() => {
  const { status, data, error } = router.data.peek();
  // Render pending, ready or errored state with your chosen renderer.
});

await router.submit(async ({ signal }) => {
  const response = await fetch("/api/save", { method: "POST", signal });
  if (!response.ok) throw new Error(`Save failed: ${response.status}`);
  return response.json();
});

await router.invalidate();
unsubscribe();
router.dispose();
```

Loading starts immediately and follows pathname/query changes; history-only and
fragment changes do not reload. Invalidation retains the current location's data
while pending; navigation clears data from the previous location. Errors appear
in `data` and explicit invalidation rejects. Superseded loads cannot publish,
even if they ignore cancellation. Invalidation promises follow the latest load
until it settles. Each runtime owns its own work.

`submit` exposes `submitting`, returns the action result and revalidates after
success. Failed actions reject. A failed follow-up load appears in `data.error`
without changing the successful action result. A newer submission, navigation or
disposal aborts the old action. Any successful write still revalidates the current
location unless the runtime has been disposed.
Abort signals do not roll back a server write, and operations that ignore them
may still finish; their original promises retain their own results/errors.
Dispose aborts work and unsubscribes navigation; later loads/submissions reject.

Pass this runtime to `MoonshineRouter` for React consumers. TanStack's
`useRouter().invalidate()` delegates to it. Navigation-only runtimes reject that
call rather than silently succeeding. TanStack loading state follows this runtime; loader failures stay in its data
state when invalidating through the adapter. TanStack loader hooks, route
registries, matches, automatic SSR data transport and hydration remain unsupported. This
entry adds no automatic data endpoint, server serialization or route cache.

### Initial ready data

Pass an explicit location-bound seed as the third argument to reuse data already
loaded by the application, including server loader results:

```ts
const seed = { location: "/posts?sort=new", data: { title: "Latest posts" } };
const router = createDataRouter(loadClientData, seed.location, seed);
// The state is immediately ready; loadClientData has not run.
await router.invalidate(); // Explicit reloads still run the client loader.
```

The seed location must exactly equal the runtime's canonical pathname plus
query. A mismatched path or query discards the seed and starts the normal initial
load; fragments are absent from that key. Falsy values and an explicitly typed
`undefined` payload are valid ready data. Later navigation, invalidation,
submission and disposal keep their ordinary behavior. Seeds are per runtime,
with no global cache, expiry policy or automatic refresh.

Applications choose the payload and own its transport and validation. When
embedding it in HTML, use the existing server `serializeData` helper for HTML-safe
JSON. This constructor does not read document scripts, serialize errors, infer
nested loader matches or hydrate existing DOM.

React applications can read the complete owning runtime state through the
separate `@tschk/moonshine-router/data-react` entry:

```tsx
import { useRouteData } from "@tschk/moonshine-router/data-react";

function Page() {
  const { status, data, error } = useRouteData();
  if (status === "errored") return <p>{String(error)}</p>;
  return (
    <output aria-busy={status === "pending"}>
      {String(data ?? "Loading")}
    </output>
  );
}
```

Supply a `createDataRouter` runtime to the enclosing `MoonshineRouter`; a
navigation-only runtime rejects this hook. The hook returns the complete stable
state snapshot, including retained data during same-location reloads and loader
errors as values. Data is `unknown` and applications must narrow it before use.
Subscriptions follow the owning runtime and stop when the component unmounts.
SSR reads only that runtime's current snapshot; this does not extract or serialize
server data, suspend rendering, select nested route matches, or add hydration.
The renderer-neutral `/data` entry remains React-free.

Components can submit through that same owning runtime without capturing it
outside the provider:

```tsx
import {
  useRouteSubmit,
  useRouteSubmitting,
} from "@tschk/moonshine-router/data-react";
import type { RouteDataContext } from "@tschk/moonshine-router/data";

function Save({
  write,
  onError,
}: {
  write: (context: RouteDataContext) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const submit = useRouteSubmit();
  const pending = useRouteSubmitting();
  return (
    <button
      disabled={pending}
      onClick={() => void submit(write).catch(onError)}
    >
      Save
    </button>
  );
}
```

`useRouteSubmit` preserves the action result type and returns the runtime's stable
runner. `useRouteSubmitting` follows its latest active submission, including
follow-up revalidation; it does not count all unresolved cancelled operations.
Both follow provider replacement and reject a navigation-only runtime. SSR reads
the owning state; unmount unsubscribes React, while the application still owns
runtime disposal. Failed actions reject their own promises. A successful action
keeps its result if the follow-up loader fails, with that error in `useRouteData`.
Successful cancelled/superseded actions still revalidate current data unless
disposed, since cancellation cannot undo their writes.

A real HTTP/Chromium form checks ten phases covering write success/failure,
supersession, reload failure, recovery, navigation and disposal, with input
identity/focus/selection retained during updates. The existing reader-only
consumer stays 3,084 raw / 1,343 gzip bytes; the whole form fixture is 60,836 gzip
bytes including React DOM and test controls. No host-router or timing comparison
is claimed. Applications own form serialization, transport and validation;
host `useSubmit`/`useNavigation` semantics and nested loader lifecycles remain open.

## Optional HTTP route data

`@tschk/moonshine-router/data-http` connects the data runtime to server route
loaders/actions. Enable `dataRequests` in the server handler or your Bun/Node
`moonshine.config.ts` first; see the [server protocol](../server/README.md#opt-in-route-data-responses).
This entry imports no renderer, React, host router or server module.

```ts
import { createDataRouter } from "@tschk/moonshine-router/data";
import { createRouteDataClient } from "@tschk/moonshine-router/data-http";
import { decodePage } from "./validation"; // Your application validates unknown JSON.

const client = createRouteDataClient(); // Uses the browser origin.
const router = createDataRouter(async (context) =>
  decodePage(await client.load(context)),
);

const result = await router.submit((context) =>
  client.action(context, {
    method: "POST",
    body: new URLSearchParams({ title: "Updated" }),
  }),
);
// result is unknown until your application validates it.
```

`load` returns the whole server loader-data map. `action` returns the action's
JSON value; the existing router then performs one independent reload. A failed
reload retains the successful action result. Bodyless protocol successes
(204/205) return `null`. Applications own body encoding, authentication,
authorization and payload validation. Opted-in loader/action results become
client-visible data; return only the values intended for the client.

Requests stay within the configured origin, carry the owning abort signal and
use same-origin credentials/mode. Nonbrowser callers supply `origin` explicitly.
Non-2xx responses are thrown as `Response` values for caller inspection; network
and abort failures retain their errors. Redirects are rejected by fetch and are
not converted into navigation. Explicit server `Response` values and error
boundaries remain ordinary HTTP, not protocol envelopes. Aborting observation
cannot roll back a server write; an uncertain outcome may need an explicit refresh.
This does not implement host forms, fetchers, RSC or hydration.
