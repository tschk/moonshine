import { Inter } from "next/font/google";
import type { ReactNode } from "react";

const inter = Inter({ subsets: ["latin"] });

export const metadata = { title: "Adopt fixture" };

export default function RootLayout({ children }: { children?: ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className} data-fixture-layout="root">
        {children}
      </body>
    </html>
  );
}
