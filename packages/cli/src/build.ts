export async function buildCommand(args: string[]): Promise<void> {
  const proc = Bun.spawn(["bunx", "vite", "build", ...args], {
    cwd: process.cwd(),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(await proc.exited);
}
