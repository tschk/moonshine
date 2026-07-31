declare module "waku/router/client" {
  export function Link(props: {
    to: string;
    children?: unknown;
    className?: string;
    [key: string]: unknown;
  }): unknown;
  export function useRouter_UNSTABLE(): {
    path: string;
    query?: string;
    push: (to: string) => void;
    replace: (to: string) => void;
  };
}

declare module "waku/client" {
  export function Slot(props: { id: string; children?: unknown }): unknown;
}
