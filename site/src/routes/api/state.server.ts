import { readEdgeFacts } from "../../edge";
import { PACKAGES } from "../../packages";

/**
 * `api` mode route. The compiler classifies it from the exported `GET`, and
 * the server pipeline returns the `Response` this handler builds verbatim.
 */
export async function GET(request: Request): Promise<Response> {
  const edge = await readEdgeFacts(request);
  return Response.json(
    {
      site: "moonshine.tsc.hk",
      renderer: "moonshine-site",
      runtime: "cloudflare",
      kernelBytesMinified: 2985,
      edge,
      packages: PACKAGES.map((entry) => ({
        name: entry.name,
        group: entry.group,
        role: entry.role,
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
