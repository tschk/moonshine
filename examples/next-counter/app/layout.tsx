import type { ReactNode } from "react";

export const metadata = {
  title: "moonshine + Next",
  description: "Client-island signals via @tschk/moonshine-next",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", margin: 0 }}>{children}</body>
    </html>
  );
}
