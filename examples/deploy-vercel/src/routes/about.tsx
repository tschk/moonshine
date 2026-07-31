export default function About({ data }: { data: unknown }) {
  const d = (data ?? {}) as Record<string, string>;
  return (
    <main>
      <h1>{d.title ?? "About"}</h1>
    </main>
  );
}
