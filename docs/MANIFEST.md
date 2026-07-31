# Build manifest

Every `moonshine build` writes `.moonshine/manifest.json`. This document
explains version 1 of the schema.

## Schema version

```ts
const MANIFEST_VERSION = 1;
```

`version` is a monotonically increasing integer. Adapters reject manifests with
an unrecognized version.

## `MoonshineManifest`

| Field              | Type                                                       | Description                                |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------ |
| `version`          | `1`                                                        | Manifest schema version.                   |
| `frameworkVersion` | `string`                                                   | `@tschk/moonshine-framework` version.      |
| `routes`           | `RouteArtifact[]`                                          | Resolved routes and their output metadata. |
| `assets`           | `{ path, file, integrity? }[]`                             | Compiled bundles and static assets.        |
| `entries`          | `{ server?, client? }`                                     | Entry points for the server and client.    |
| `capabilities`     | `("streaming" \| "islands" \| "edge" \| "revalidation")[]` | Features the build requires.               |

## `RouteArtifact`

A `RouteArtifact` extends `RouteDefinition` with compiler output.

| Field           | Type                                               | Description                                 |
| --------------- | -------------------------------------------------- | ------------------------------------------- |
| `id`            | `string`                                           | Unique route id.                            |
| `path`          | `string`                                           | URL pattern (`:param`, `:param?`, `*rest`). |
| `file`          | `string`                                           | Project-relative route module path.         |
| `mode`          | `"static" \| "ssr" \| "island" \| "spa" \| "api"`  | Resolved render mode.                       |
| `runtime`       | `"bun" \| "node" \| "cloudflare" \| "vercel-edge"` | Runtime target.                             |
| `decision`      | `string`                                           | Human-readable reason for the mode choice.  |
| `serverEntry`   | `string?`                                          | Server bundle entry path.                   |
| `clientEntries` | `string[]`                                         | Client bundle entry paths (island/spa).     |
| `staticOutput`  | `string?`                                          | Pre-rendered HTML path for static routes.   |
| `dataFile`      | `string?`                                          | Project-relative data module path.          |
| `layouts`       | `string[]?`                                        | Project-relative layout modules.            |
| `middleware`    | `string[]?`                                        | Project-relative middleware modules.        |
| `errorBoundary` | `string?`                                          | Nearest project-relative error module.      |
| `cache`         | `{ control?, revalidate? }?`                       | Cache policy for the route.                 |
| `headers`       | `Record<string, string>?`                          | Extra response headers.                     |

## Capabilities

The compiler derives capabilities from the route set.

- `streaming` — always added.
- `islands` — added when any route is `island` or `spa`.
- `edge` — added when any route uses `cloudflare` or `vercel-edge`.
- `revalidation` — added when any route defines `cache.revalidate`.

Adapters validate that they support every capability in the manifest; if not,
the build fails with a clear message.

## Example

```json
{
  "version": 1,
  "frameworkVersion": "0.2.0",
  "routes": [
    {
      "id": "index",
      "path": "/",
      "file": "src/routes/index.tsx",
      "layouts": ["src/routes/+layout.tsx"],
      "middleware": ["src/routes/+middleware.ts"],
      "errorBoundary": "src/routes/+error.tsx",
      "mode": "static",
      "runtime": "bun",
      "decision": "deterministic build-time route",
      "clientEntries": [],
      "serverEntry": "dist/server.js",
      "staticOutput": "static/index.html"
    },
    {
      "id": "about",
      "path": "/about",
      "file": "src/routes/about.tsx",
      "dataFile": "src/routes/about.data.ts",
      "layouts": ["src/routes/+layout.tsx"],
      "middleware": ["src/routes/+middleware.ts"],
      "errorBoundary": "src/routes/+error.tsx",
      "mode": "ssr",
      "runtime": "bun",
      "decision": "uses request-time server data",
      "clientEntries": [],
      "serverEntry": "dist/server.js"
    },
    {
      "id": "counter",
      "path": "/counter",
      "file": "src/routes/counter.tsx",
      "layouts": ["src/routes/+layout.tsx"],
      "middleware": ["src/routes/+middleware.ts"],
      "errorBoundary": "src/routes/+error.tsx",
      "mode": "island",
      "runtime": "bun",
      "decision": "contains an interactive client subtree",
      "clientEntries": ["/dist/client.js"],
      "serverEntry": "dist/server.js"
    }
  ],
  "assets": [
    {
      "file": "dist/client.js",
      "path": "/dist/client.js",
      "integrity": "sha256-..."
    },
    {
      "file": "dist/server.js",
      "path": "/dist/server.js",
      "integrity": "sha256-..."
    }
  ],
  "entries": {
    "server": "dist/server.js",
    "client": "/dist/client.js"
  },
  "capabilities": ["islands", "streaming"]
}
```

## Inspection

`moonshine inspect` prints the resolved mode and reason for every route:

```text
static  /            deterministic build-time route
island  /counter     contains an interactive client subtree
ssr     /about       uses request-time server data
api     /api/health  exports request handler
```

Use `moonshine inspect --json` to print the manifest unchanged.

## Stability

- The schema version changes only when a field is added, removed, or changes
  meaning.
- New optional fields may be added within the same version, but required fields
  stay stable.
- Adapters should ignore unknown optional fields and fail on unknown required
  fields.
