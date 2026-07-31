export function middleware(_context: unknown, next: () => unknown): unknown {
  return next();
}
