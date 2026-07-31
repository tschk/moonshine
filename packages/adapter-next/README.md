# `@tschk/moonshine-next`

Next.js adapter for Moonshine. Re-exports real Next.js libraries on subpaths
plus moonshine signal bridges.

```ts
import { createSignal, useSignal } from "@tschk/moonshine-next";
import { useRouter, usePathnameSignal } from "@tschk/moonshine-next/navigation";
import Link from "@tschk/moonshine-next/link";
import Image from "@tschk/moonshine-next/image";
import { headers } from "@tschk/moonshine-next/headers";
import { useFragmentShader } from "@tschk/moonshine-next/shaders";
import { moonshineRoute, moonshineJson } from "@tschk/moonshine-next/server";
```

| Subpath          | Host library                                       |
| ---------------- | -------------------------------------------------- |
| `.` / `./client` | moonshine signals + resources (`"use client"`)     |
| `./navigation`   | `next/navigation` + pathname/search signals        |
| `./link`         | `next/link`                                        |
| `./image`        | `next/image`                                       |
| `./headers`      | `next/headers` (server only)                       |
| `./dynamic`      | `next/dynamic`                                     |
| `./shaders`      | moonshine WebGL helpers                            |
| `./server`       | `moonshineRoute` / `Json` / `Html` + pages helpers |

Peer: `next` >= 15, `react` >= 18, `react-dom` >= 18.

Does **not** export `MoonshineRouter` — use the Next.js App Router.

See [Moonshine README](../../README.md).
