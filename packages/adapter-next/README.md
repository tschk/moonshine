# @tschk/moonshine-next

**Use Next libraries inside moonshine** (peer-install `next`).

```ts
import { createSignal, useSignal } from "@tschk/moonshine-next";
import { useRouter, usePathnameSignal } from "@tschk/moonshine-next/navigation";
import Link from "@tschk/moonshine-next/link";
import Image from "@tschk/moonshine-next/image";
import { headers, cookies } from "@tschk/moonshine-next/headers";
import dynamic from "@tschk/moonshine-next/dynamic";
import { useFragmentShader } from "@tschk/moonshine-next/shaders";
import { moonshineRoute, moonshineJson } from "@tschk/moonshine-next/server";
```

| Subpath | Provides |
|---------|----------|
| `.` / `./client` | moonshine signals + resources (`"use client"`) |
| `./navigation` | `next/navigation` + pathname/search signals |
| `./link` | `next/link` |
| `./image` | `next/image` |
| `./headers` | `next/headers` (server only) |
| `./dynamic` | `next/dynamic` |
| `./shaders` | moonshine WebGL helpers |
| `./server` | `moonshineRoute` / `Json` / `Html` + pages helpers |

Does **not** export MoonshineRouter — App Router owns routing.
