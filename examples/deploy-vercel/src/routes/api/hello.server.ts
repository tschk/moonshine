export default function handler(request: Request): Response {
  return Response.json({ ok: true, method: request.method });
}
