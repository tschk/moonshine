import type { ReactNode } from "react";

export default function DocumentLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="site">
      <head>
        <meta
          name="viewport"
          content="width=device-width, viewport-fit=cover"
        />
      </head>
      <body className="page">{children}</body>
    </html>
  );
}
