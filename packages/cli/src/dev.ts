export async function devCommand(args: string[]): Promise<void> {
  const proc = Bun.spawn(["bunx", "vite", ...args], {
    cwd: process.cwd(),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(await proc.exited);
}
