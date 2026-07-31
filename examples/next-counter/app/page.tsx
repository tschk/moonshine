import { Counter } from "./counter";

/** Server Component shell — signals live in the client island. */
export default function Page() {
  return (
    <main style={{ padding: 32, maxWidth: 480 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>moonshine-next</h1>
      <p style={{ color: "#555", marginBottom: 16 }}>
        App Router page is a Server Component. Counter uses{" "}
        <code>@tschk/moonshine-next</code> in a Client Component.
      </p>
      <Counter />
    </main>
  );
}
