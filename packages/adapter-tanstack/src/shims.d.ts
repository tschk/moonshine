declare module "@tanstack/react-query" {
  export type QueryKey = readonly unknown[];
  export type UseQueryOptions<TData = unknown> = {
    queryKey: QueryKey;
    queryFn: () => Promise<TData>;
    enabled?: boolean;
    initialData?: TData;
    staleTime?: number;
  };
  export type UseQueryResult<TData = unknown> = {
    data: TData | undefined;
    error: Error | null;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    isSuccess: boolean;
    status: "pending" | "error" | "success";
    refetch: () => Promise<unknown>;
  };
  export function useQuery<TData = unknown>(
    options: UseQueryOptions<TData>,
  ): UseQueryResult<TData>;
  export function useMutation<TData = unknown, TVar = unknown>(options: {
    mutationFn: (vars: TVar) => Promise<TData>;
    onSuccess?: (data: TData) => void;
    onError?: (err: Error) => void;
  }): {
    mutate: (vars: TVar) => void;
    mutateAsync: (vars: TVar) => Promise<TData>;
    data: TData | undefined;
    error: Error | null;
    isPending: boolean;
    isError: boolean;
    isSuccess: boolean;
    reset: () => void;
  };
  export function useQueryClient(): {
    invalidateQueries: (opts?: { queryKey?: QueryKey }) => Promise<void>;
    setQueryData: (key: QueryKey, data: unknown) => void;
    getQueryData: <T>(key: QueryKey) => T | undefined;
  };
  export function QueryClient(opts?: object): unknown;
  export function QueryClientProvider(props: {
    client: unknown;
    children?: unknown;
  }): unknown;
}

declare module "@tanstack/react-router" {
  export function useNavigate(): (opts: {
    to: string;
    replace?: boolean;
    search?: object;
  }) => void;
  export function useParams<
    T extends Record<string, string> = Record<string, string>,
  >(opts?: { from?: string; strict?: boolean }): T;
  export function useRouterState<
    T = { location: { pathname: string; search: object } },
  >(opts?: { select?: (s: unknown) => T }): T;
  export function useSearch<T extends object = object>(opts?: {
    from?: string;
    strict?: boolean;
  }): T;
  export function Link(props: {
    to: string;
    children?: unknown;
    className?: string;
    [key: string]: unknown;
  }): unknown;
  export function Outlet(): unknown;
}
