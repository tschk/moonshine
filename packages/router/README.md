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
registries, matches, SSR data seeding and hydration remain unsupported. This
entry adds no automatic data endpoint, server serialization or route cache.

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
SSR reads only that runtime's current snapshot; this does not seed or serialize
server data, suspend rendering, select nested route matches, or add hydration.
The renderer-neutral `/data` entry remains React-free.
