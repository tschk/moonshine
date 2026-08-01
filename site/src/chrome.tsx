import type { ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  external?: boolean;
};

/**
 * Overview and packages are one link, not two: it points at whichever of the
 * pair you are not on. `current` comes from the request path during SSR, so
 * the correct label is already in the HTML — no client JavaScript decides it.
 */
export function pivotLink(current: string): NavItem {
  return current === "/packages"
    ? { href: "/", label: "← overview" }
    : { href: "/packages", label: "packages →" };
}

const TAIL: NavItem[] = [
  { href: "/api/state", label: "api" },
  {
    href: "https://github.com/tschk/moonshine",
    label: "github",
    external: true,
  },
  { href: "https://tsc.hk", label: "tsc.hk", external: true },
];

export function Chrome({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
  const items = [pivotLink(current), ...TAIL];
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
          {items.map((item, index) => (
            <a
              key={item.href}
              /* The pivot is the only nav entry whose href and text differ
                 between the two pages, so it is the one that carries a
                 view-transition-name: the old and new anchors are then the
                 same element to the browser and it morphs between them. */
              className={index === 0 ? "pivot" : undefined}
              href={item.href}
              {...(item.external
                ? { rel: "noopener noreferrer", target: "_blank" }
                : {})}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer>
        <span>built with crepuscularity + moonshine</span>
        <span>
          <a href="https://tsc.hk" rel="noopener noreferrer">
            tsc.hk
          </a>{" "}
          · ISC
        </span>
      </footer>
    </div>
  );
}
