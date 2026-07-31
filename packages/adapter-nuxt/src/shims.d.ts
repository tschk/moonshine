declare module "#app" {
  export function useState<T>(key: string, init?: () => T): { value: T };
  export function useFetch<T>(
    url: string,
    opts?: object,
  ): {
    data: { value: T | null };
    pending: { value: boolean };
    error: { value: Error | null };
    refresh: () => Promise<void>;
  };
  export function useAsyncData<T>(
    key: string,
    handler: () => Promise<T>,
    opts?: object,
  ): {
    data: { value: T | null };
    pending: { value: boolean };
    error: { value: Error | null };
    refresh: () => Promise<void>;
  };
  export function navigateTo(
    to: string,
    opts?: { replace?: boolean; redirectCode?: number; external?: boolean },
  ): Promise<void> | void;
  export function useRoute(): {
    path: string;
    fullPath: string;
    params: Record<string, string>;
    query: Record<string, string | string[]>;
  };
  export function useRouter(): {
    push: (to: string) => Promise<void>;
    replace: (to: string) => Promise<void>;
  };
  export function useCookie<T>(
    name: string,
    opts?: object,
  ): { value: T | null | undefined };
  export function useRequestHeaders(keys?: string[]): Record<string, string>;
  export function useRuntimeConfig(): Record<string, unknown>;
}

declare module "nuxt/app" {
  export * from "#app";
}
