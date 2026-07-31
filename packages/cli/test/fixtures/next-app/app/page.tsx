import Link from "next/link";
import { Counter } from "./counter";

export default function Home() {
  return (
    <main data-fixture-page="home">
      <h1>Adopt fixture</h1>
      <Link href="/about">About</Link>
      <Counter />
    </main>
  );
}
