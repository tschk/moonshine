# Native app

Run `bun install` from the repository root, then `bun run dev` here. `bun run build` creates the Bun artifact; `bun .moonshine/server.ts` runs it.

`/` renders request data and a shared layout on the server. Try `/?name=Alice`, or submit the greeting form: its server action validates the name and redirects without JavaScript. `/about` declares static mode. `/counter` sends loader data to an explicit browser entry with a reactive counter and select.

The server uses `/ssr`; the client uses `/dom` and `/reactive`. Neither renderer imports React or Solid. These paired entrypoints are authored directly. The [native TSX template example](../native-template/README.md) instead uses Crepuscularity to emit both targets from markup, with authored state and handlers. Native islands and hydration are unsupported; SPA routes mount fresh DOM. Static mode currently renders through the server when no prerendered artifact exists.

`bun test` checks server escaping and loader data. Browser and relocated-artifact checks live in the repository integration suite.

Page and layout modules may export `metadata`: the layout supplies title, description and language defaults; the home page derives its title from completed loader data. The counter supplies its title without running a server page component.

The image at `/logo.svg` comes from `public/logo.svg`, copied and hashed by the
compiler. Put regular static files in `public/`; no component parser is involved.
