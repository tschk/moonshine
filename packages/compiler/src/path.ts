export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}
