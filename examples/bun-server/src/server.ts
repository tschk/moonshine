/**
 * Moonshine as the app server — no Next/Vite host required.
 *
 *   bun run dev
 */
import {
  createMoonshineServer,
  definePage,
  type MoonshineRequest,
} from "@tschk/moonshine/server";

function html(body: string, title = "moonshine"): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; }
    a { color: #358ff3; }
    code { background: #f2f2f4; padding: 0.1em 0.35em; border-radius: 4px; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

const server = createMoonshineServer({
  port: Number(process.env.PORT) || 3000,
  pages: {
    "/": definePage({
      render: () =>
        html(`
          <h1>moonshine</h1>
          <p>Bun-native server via <code>@tschk/moonshine/server</code>.</p>
          <ul>
            <li><a href="/about">about</a></li>
            <li><a href="/api/hello">api/hello</a></li>
            <li><a href="/blog/hello">blog/* splat</a></li>
          </ul>
        `),
    }),
    "/about": definePage({
      render: () =>
        html(`
          <h1>about</h1>
          <p>No metaframework. Pages map → <code>Bun.serve</code>.</p>
          <p><a href="/">home</a></p>
        `, "about"),
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
        html(`
          <h1>blog</h1>
          <p>splat path: <code>${req.pathname}</code></p>
          <p><a href="/">home</a></p>
        `, "blog"),
    }),
  },
  notFound: (req) =>
    new Response(html(`<h1>404</h1><p>${req.pathname}</p><p><a href="/">home</a></p>`, "404"), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
});

const handle = server.listen() as { port?: number } | undefined;
const port = handle?.port ?? server.port;
console.log(`moonshine bun-server → http://localhost:${port}`);
