import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav>
        <a href="/">home</a> <a href="/counter">counter</a>{" "}
        <a href="/account/1">account</a> <a href="/dashboard">dashboard</a>{" "}
        <a href="/api/health">health</a>
      </nav>
      <main>{children}</main>
    </>
  );
}
