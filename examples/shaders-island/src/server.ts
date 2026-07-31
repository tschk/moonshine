import { join } from "node:path";
import { createMoonshineServer, definePage } from "@tschk/moonshine/server";

const publicDir = join(import.meta.dir, "..", "public");

const server = createMoonshineServer({
  port: Number(process.env.PORT) || 5179,
  staticDir: publicDir,
  pages: {
    "/": definePage({
      render: () => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>moonshine shaders</title>
  <link rel="stylesheet" href="/app.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/client.js"></script>
</body>
</html>`,
    }),
  },
});

const handle = server.listen() as { port?: number };
console.log(`shaders-island → http://localhost:${handle?.port ?? server.port}`);
