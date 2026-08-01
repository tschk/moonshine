import { readEdgeFacts } from "../../edge";
import { PACKAGES } from "../../packages";
import { fetchCrepusCrates, fetchNpmScope } from "../../registry";

/**
 * `api` mode route. The compiler classifies it from the exported `GET`, and
 * the server pipeline returns the `Response` this handler builds verbatim.
 */
export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const [edge, npm, crates] = await Promise.all([
    readEdgeFacts(request),
    fetchNpmScope(),
    fetchCrepusCrates(),
  ]);
  const npmVersions = new Map(
    npm.versions.map((entry) => [entry.name, entry.version]),
  );
  return Response.json(
    {
      site: "moonshine.tsc.hk",
      renderer: "moonshine-site",
      runtime: "cloudflare",
      kernelBytesMinified: 2985,
      edge,
      timing: { handlerMs: Date.now() - startedAt },
      npm: {
        published: npm.published,
        asked: npm.asked,
        distinct: npm.distinct,
        elapsedMs: npm.elapsedMs,
      },
      crates,
      packages: PACKAGES.map((entry) => ({
        name: entry.name,
        group: entry.group,
        role: entry.role,
        npmLatest: npmVersions.get(entry.name) ?? null,
      })),
    },
    {
      headers: {
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    },
  );
}
