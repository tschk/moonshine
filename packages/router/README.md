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
