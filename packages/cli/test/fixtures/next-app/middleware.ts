export function middleware() {
  return new Response(null, { headers: { "x-fixture": "1" } });
}

export const config = { matcher: "/about" };
