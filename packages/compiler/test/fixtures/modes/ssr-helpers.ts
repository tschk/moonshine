export function cookies(): {
  get(name: string): { value: string } | undefined;
} {
  return { get: () => ({ value: "session" }) };
}
