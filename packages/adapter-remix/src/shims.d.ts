declare module "@remix-run/react" {
  import type { ComponentType, ReactNode } from "react";
  export function useLoaderData<T = unknown>(): T;
  export function useActionData<T = unknown>(): T | undefined;
  export function useNavigate(): (
    to: string,
    opts?: { replace?: boolean },
  ) => void;
  export function useLocation(): {
    pathname: string;
    search: string;
    hash: string;
  };
  export function useParams<
    T extends Record<string, string | undefined> = Record<
      string,
      string | undefined
    >,
  >(): T;
  export function useFetcher<T = unknown>(): {
    state: "idle" | "submitting" | "loading";
    data: T | undefined;
    Form: ComponentType<{
      method?: string;
      action?: string;
      children?: ReactNode;
    }>;
    submit: (
      data: unknown,
      opts?: { method?: string; action?: string },
    ) => void;
    load: (href: string) => void;
  };
  export function useRevalidator(): { state: string; revalidate: () => void };
  export function useNavigation(): {
    state: string;
    location?: { pathname: string };
  };
  export function Link(props: {
    to: string;
    children?: ReactNode;
    className?: string;
    prefetch?: string;
    [key: string]: unknown;
  }): ReactNode;
  export function NavLink(props: {
    to: string;
    children?: ReactNode | ((args: { isActive: boolean }) => ReactNode);
    className?: string | ((args: { isActive: boolean }) => string);
    [key: string]: unknown;
  }): ReactNode;
  export function Outlet(props?: { context?: unknown }): ReactNode;
  export function Form(props: {
    method?: string;
    action?: string;
    children?: ReactNode;
    [key: string]: unknown;
  }): ReactNode;
}

declare module "react-router" {
  export function useNavigate(): (
    to: string | number,
    opts?: { replace?: boolean },
  ) => void;
  export function useLocation(): {
    pathname: string;
    search: string;
    hash: string;
  };
  export function useParams<
    T extends Record<string, string | undefined> = Record<
      string,
      string | undefined
    >,
  >(): T;
  export function useSearchParams(): [
    URLSearchParams,
    (next: URLSearchParams) => void,
  ];
}
