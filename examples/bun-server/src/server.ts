/**
 * Moonshine owns HTTP + static + hydrate island — no Next/Vite host required.
 *
 *   bun run dev
 */
import { join } from "node:path";
import {
  createMoonshineServer,
  definePage,
  type MoonshineRequest,
} from "@tschk/moonshine/server";

const root = import.meta.dir;
const publicDir = join(root, "..", "public");

function shell(body: string, title = "moonshine"): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="/app.css" />
</head>
<body>
${body}
</body>
</html>`;
}

const server = createMoonshineServer({
  port: Number(process.env.PORT) || 3000,
  staticDir: publicDir,
  pages: {
    "/": definePage({
      render: () =>
        shell(`
  <main>
    <h1>moonshine</h1>
    <p>Bun-native server: pages + <code>staticDir</code> + client hydrate.</p>
    <ul>
      <li><a href="/about">about</a></li>
      <li><a href="/api/hello">api/hello</a></li>
      <li><a href="/blog/hello">blog/* splat</a></li>
    </ul>
    <div id="counter"><p class="muted">loading island…</p></div>
    <script type="module" src="/client.js"></script>
  </main>
`),
    }),
    "/about": definePage({
      render: () =>
        shell(
          `
  <main>
    <h1>about</h1>
    <p>No metaframework. <code>createMoonshineServer</code> → <code>Bun.serve</code>.</p>
    <p>Static assets from <code>public/</code>. Interactive island via bundled <code>/client.js</code>.</p>
    <p><a href="/">home</a></p>
  </main>
`,
          "about",
        ),
    }),
    "/api/hello": definePage({
      render: (req: MoonshineRequest) => ({
        ok: true,
        path: req.pathname,
        method: req.method,
      }),
    }),
    "/blog/*": definePage({
      render: (req: MoonshineRequest) =>
        shell(
          `
  <main>
    <h1>blog</h1>
    <p>splat path: <code>${req.pathname}</code></p>
    <p><a href="/">home</a></p>
  </main>
`,
          "blog",
        ),
    }),
  },
  notFound: (req) =>
    new Response(
      shell(
        `<main><h1>404</h1><p>${req.pathname}</p><p><a href="/">home</a></p></main>`,
        "404",
      ),
      {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    ),
});

const handle = server.listen() as { port?: number } | undefined;
const port = handle?.port ?? server.port;
console.log(`moonshine bun-server → http://localhost:${port}`);
