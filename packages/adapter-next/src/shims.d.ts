/** Ambient types so adapter builds without installing Next in every workspace. */
declare module "next/navigation" {
  export function useRouter(): {
    push(href: string): void;
    replace(href: string): void;
    back(): void;
    forward(): void;
    refresh(): void;
    prefetch(href: string): void;
  };
  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
  export function useParams<T extends Record<string, string | string[]> = Record<string, string>>(): T;
  export function redirect(url: string): never;
  export function notFound(): never;
  export function permanentRedirect(url: string): never;
  export function useSelectedLayoutSegment(): string | null;
  export function useSelectedLayoutSegments(): string[];
}

declare module "next/link" {
  import type { ComponentType, ReactNode, CSSProperties, MouseEventHandler } from "react";
  export type LinkProps = {
    href: string;
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
    replace?: boolean;
    scroll?: boolean;
    prefetch?: boolean;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
    [key: string]: unknown;
  };
  const Link: ComponentType<LinkProps>;
  export default Link;
}

declare module "next/image" {
  import type { ComponentType, CSSProperties } from "react";
  export type ImageProps = {
    src: string | { src: string; height: number; width: number };
    alt: string;
    width?: number;
    height?: number;
    fill?: boolean;
    className?: string;
    style?: CSSProperties;
    priority?: boolean;
    quality?: number;
    sizes?: string;
    [key: string]: unknown;
  };
  const Image: ComponentType<ImageProps>;
  export default Image;
}

declare module "next/headers" {
  export function headers(): Headers;
  export function cookies(): {
    get(name: string): { name: string; value: string } | undefined;
    getAll(): Array<{ name: string; value: string }>;
    has(name: string): boolean;
    set(name: string, value: string): void;
    delete(name: string): void;
  };
  export function draftMode(): { isEnabled: boolean; enable(): void; disable(): void };
}

declare module "next/dynamic" {
  import type { ComponentType } from "react";
  export default function dynamic<P = object>(
    loader: () => Promise<{ default: ComponentType<P> } | ComponentType<P>>,
    options?: { ssr?: boolean; loading?: ComponentType },
  ): ComponentType<P>;
}
