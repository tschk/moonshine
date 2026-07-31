export class Redirect extends Error {
  status: number;
  location: string;

  constructor(location: string, status = 302) {
    super(`Redirect to ${location}`);
    this.name = "Redirect";
    this.location = location;
    this.status = status;
  }
}

export function redirect(location: string, status = 302): never {
  throw new Redirect(location, status);
}

export function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(
  error: unknown,
  mode?: "development" | "production",
): Response {
  // Anything but an explicit development mode is treated as production: the
  // thrown value can carry file paths, queries, or secrets, so only the
  // generic status text crosses the boundary.
  if (mode !== "development") {
    return json({ error: "Internal Server Error" }, { status: 500 });
  }
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const body = stack ? { error: message, stack } : { error: message };
  return json(body, { status: 500 });
}
