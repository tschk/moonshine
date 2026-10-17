// Compiler imports keep authored globalThis bindings out of generated operations.
export function sourceRealm() {
  return globalThis;
}
