/**
 * Stands in for an untouched Next app: every import below is a real `next/*`
 * specifier, resolved only by the alias plugin.
 */
import { createElement } from "react";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

const Chart = dynamic(async () => ({ default: () => null }));

export function Page() {
  return createElement(
    "main",
    { className: inter.className },
    createElement(Link, { href: "/about" }, "About"),
    createElement(Image, {
      src: "/logo.png",
      alt: "Logo",
      width: 32,
      height: 32,
    }),
    createElement(Script, { src: "/analytics.js" }),
    createElement(Chart, {}),
    usePathname(),
  );
}
