import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "overview" },
  { href: "/packages", label: "packages" },
  { href: "/api/state", label: "api" },
  { href: "https://github.com/tschk/moonshine", label: "github" },
];

export function Chrome({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
  return (
    <div className="wrap">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a className="brand" href="/">
          moonshine
        </a>
        <nav aria-label="Primary">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              {...(item.href === current ? { "aria-current": "page" } : {})}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer>
        <span>built with crepuscularity + moonshine</span>
        <span>tsc.hk · ISC</span>
      </footer>
    </div>
  );
}
