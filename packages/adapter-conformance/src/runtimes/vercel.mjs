// A minimal Vercel Build Output API v3 host: applies config.json routes, serves
// `static/`, runs Node functions in this Node process the way Vercel's Node
// launcher does (default export `(req, res)`), and runs Edge functions in
// workerd without Node compatibility. Prints its URL.
import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { Miniflare } from "miniflare";

const output = process.argv[2];
const config = JSON.parse(await readFile(join(output, "config.json"), "utf8"));
if (config.version !== 3) throw new Error("Expected Build Output API v3");
const staticRoot = join(output, "static");

const functions = new Map();
const edgeHosts = [];
for (const entry of await readdir(join(output, "functions")).catch(() => [])) {
  if (!entry.endsWith(".func")) continue;
  const dir = join(output, "functions", entry);
  const vc = JSON.parse(await readFile(join(dir, ".vc-config.json"), "utf8"));
  const name = "/" + entry.slice(0, -".func".length);
  if (vc.runtime === "edge") {
    const mf = new Miniflare({
      modules: [
        {
          type: "ESModule",
          path: join(dir, "__entry.mjs"),
          contents: `import handler from "./${vc.entrypoint}";
export default { fetch: (request, env, ctx) => handler(request, ctx) };`,
        },
        {
          type: "ESModule",
          path: join(dir, vc.entrypoint),
          contents: await readFile(join(dir, vc.entrypoint), "utf8"),
        },
      ],
      compatibilityDate: "2026-07-01",
    });
    edgeHosts.push(mf);
    functions.set(name, { edge: mf });
  } else if (String(vc.runtime).startsWith("nodejs")) {
    if (vc.launcherType !== "Nodejs")
      throw new Error(`${entry}: unsupported launcher ${vc.launcherType}`);
    const mod = await import(pathToFileURL(join(dir, vc.handler)).href);
    if (typeof mod.default !== "function")
      throw new Error(`${entry}: default export is not a request handler`);
    functions.set(name, { node: mod.default });
  } else {
    throw new Error(`${entry}: unsupported runtime ${vc.runtime}`);
  }
}

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

async function staticFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.endsWith("/")) decoded += "index.html";
  const file = normalize(join(staticRoot, decoded));
  if (!file.startsWith(staticRoot + sep)) return undefined;
  const info = await stat(file).catch(() => undefined);
  return info?.isFile() ? file : undefined;
}

async function sendFile(res, file, method, headers = {}) {
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    ...headers,
  });
  res.end(method === "HEAD" ? undefined : await readFile(file));
}

async function runEdge(mf, req, res) {
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : Buffer.concat(await Array.fromAsync(req));
  const response = await mf.dispatchFetch(
    new URL(req.url, `http://${req.headers.host}`),
    { method: req.method, headers: req.headers, body, redirect: "manual" },
  );
  const headers = {};
  response.headers.forEach((value, key) => {
    if (key !== "content-length" && key !== "transfer-encoding")
      headers[key] = value;
  });
  res.writeHead(response.status, headers);
  if (response.body) Readable.fromWeb(response.body).pipe(res);
  else res.end();
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://localhost");
    const readable = req.method === "GET" || req.method === "HEAD";
    for (const route of config.routes) {
      if (route.handle === "filesystem") {
        const file = readable && (await staticFile(pathname));
        if (file) return await sendFile(res, file, req.method);
        continue;
      }
      if (!new RegExp(route.src).test(pathname)) continue;
      const fn = functions.get(route.dest);
      if (fn?.node) return await fn.node(req, res);
      if (fn?.edge) return await runEdge(fn.edge, req, res);
      const file = await staticFile(route.dest);
      if (!file) throw new Error(`Route destination missing: ${route.dest}`);
      return await sendFile(res, file, req.method, route.headers);
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("NOT_FOUND");
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.listen(0, () => {
  console.log(`http://localhost:${server.address().port}/`);
});
process.on("SIGTERM", () => {
  server.close();
  Promise.all(edgeHosts.map((mf) => mf.dispose())).finally(() =>
    process.exit(0),
  );
});
