# `@tschk/moonshine-angular`

Hosting adapter. Angular compiles templates and the component class;
moonshine cannot replace that compiler. `@angular/core` and
`@angular/common` are peer dependencies, re-exported on subpaths,
alongside moonshine signal bridges.

This is not a reimplementation — you cannot alias `@angular/core` onto
this package and drop Angular.

```ts
import { fromMoonshineSignal } from "@tschk/moonshine-angular";
import { Component } from "@tschk/moonshine-angular/core";
```

| Subpath    | Provides                        |
| ---------- | ------------------------------- |
| `.`        | signal bridges, crepus renderer |
| `./core`   | `@angular/core` re-exports      |
| `./common` | `@angular/common` re-exports    |

Peer: `@angular/core` / `@angular/common` >= 17.

The component class is still Angular's. Adopt compiles markup to View IR;
constructors, DI, `@Input`/`@Output`, and lifecycle hooks are not executed.
Angular has no file-based routing, so generated IR is unmounted until you
write moonshine route modules.
