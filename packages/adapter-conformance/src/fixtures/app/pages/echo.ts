export function GET(request: Request) {
  return Response.json(
    { method: request.method, header: request.headers.get("x-test") },
    { headers: { "x-moonshine": "ok" } },
  );
}

export async function POST(request: Request) {
  return Response.json({ method: request.method, body: await request.text() });
}
