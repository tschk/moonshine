// Compiler imports keep authored globalThis bindings out of generated operations.
import GlobalTypes = globalThis;
export type { GlobalTypes };

export function sourceRealm(): typeof globalThis {
  return globalThis;
}
