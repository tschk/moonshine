export default function Home({ data }: { data: unknown }) {
  const d = (data ?? {}) as Record<string, string>;
  return (
    <main>
      <h1>{d.title ?? "Cloudflare"}</h1>
    </main>
  );
}
