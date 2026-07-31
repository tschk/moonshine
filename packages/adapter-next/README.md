# @tschk/moonshine-next

Use **Next libraries inside moonshine** (and moonshine signals inside Next).

| Import | Provides |
|--------|----------|
| `@tschk/moonshine-next` | Client signals / resources (`"use client"`) |
| `@tschk/moonshine-next/navigation` | `next/navigation` + `usePathnameSignal` / `useSearchParamSignal` |
| `@tschk/moonshine-next/link` | `next/link` |
| `@tschk/moonshine-next/image` | `next/image` |
| `@tschk/moonshine-next/headers` | `next/headers` (server) |
| `@tschk/moonshine-next/dynamic` | `next/dynamic` |
| `@tschk/moonshine-next/shaders` | moonshine WebGL helpers |
| `@tschk/moonshine-next/server` | `moonshineRoute` / `moonshineJson` / pages helpers |

```tsx
"use client";
import { createSignal, useSignal } from "@tschk/moonshine-next";
import { useRouter, usePathnameSignal } from "@tschk/moonshine-next/navigation";
import Link from "@tschk/moonshine-next/link";
import Image from "@tschk/moonshine-next/image";
import { useFragmentShader } from "@tschk/moonshine-next/shaders";
```

Peer: `next`, `react`, `react-dom`.
