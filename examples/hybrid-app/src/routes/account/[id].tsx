export function loader(ctx: { params: Record<string, string> }) {
  return { id: ctx.params.id, at: new Date().toISOString() };
}

export default function AccountPage({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const account = data["account/[id]"] as
    | { id: string; at: string }
    | undefined;
  return (
    <article>
      <h1>account</h1>
      <p data-testid="account-id">{account?.id}</p>
      <time>{account?.at}</time>
    </article>
  );
}
