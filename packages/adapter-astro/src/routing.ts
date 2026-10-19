/** Independent host-free Astro static path pagination, route inference, and endpoint helpers. */
import type { APIContext } from "./middleware";

export type Params = Record<string, string | number | undefined>;
export type Props = Record<string, any>;

export interface Page<T = any> {
  /** Array of items for the current page. */
  data: T[];
  /** 0-based index of the first item on the page. */
  start: number;
  /** 0-based index of the last item on the page. */
  end: number;
  /** Number of items per page. */
  size: number;
  /** Total number of items across all pages. */
  total: number;
  /** 1-based current page number. */
  currentPage: number;
  /** Total number of pages. */
  lastPage: number;
  /** Navigation URLs for the current page. */
  url: {
    current: string;
    prev: string | undefined;
    next: string | undefined;
    first: string | undefined;
    last: string | undefined;
  };
}

export interface PaginateOptions<
  PaginateProps extends Props = Props,
  PaginateParams extends Params = Params,
> {
  pageSize?: number;
  params?: PaginateParams;
  props?: PaginateProps;
}

export interface GetStaticPathsItem<
  ItemProps extends Props = Props,
  ItemParams extends Params = Params,
> {
  params: ItemParams;
  props: ItemProps;
}

export type GetStaticPathsResult<
  ItemProps extends Props = Props,
  ItemParams extends Params = Params,
> = GetStaticPathsItem<ItemProps, ItemParams>[];

export type PaginateFunction = <
  T,
  PaginateProps extends Props = Props,
  PaginateParams extends Params = Params,
>(
  data: readonly T[],
  args?: PaginateOptions<PaginateProps, PaginateParams>,
) => GetStaticPathsResult<
  PaginateProps & { page: Page<T> },
  PaginateParams & { page?: string }
>;

export interface GetStaticPathsOptions {
  paginate: PaginateFunction;
}

export type GetStaticPaths = (
  options: GetStaticPathsOptions,
) => Promise<GetStaticPathsResult<any, any>> | GetStaticPathsResult<any, any>;

export type InferGetStaticParamsType<T> = T extends (opts: any) => infer R
  ? Awaited<R> extends Array<{ params: infer P }>
    ? P
    : never
  : never;

export type InferGetStaticPropsType<T> = T extends (opts: any) => infer R
  ? Awaited<R> extends Array<{ props: infer P }>
    ? P
    : never
  : never;

export type APIRoute<
  RouteProps extends Record<string, any> = Record<string, any>,
  RouteParams extends Record<string, string | undefined> = Record<
    string,
    string | undefined
  >,
> = (
  context: APIContext<RouteProps, RouteParams>,
) => Response | Promise<Response>;

export interface CreatePaginateOptions {
  /** Base path prefix (defaults to `""`). */
  base?: string;
  /** Trailing slash policy (defaults to `"ignore"`). */
  trailingSlash?: "always" | "never" | "ignore";
  /** Dynamic parameter name used for pagination (defaults to `"page"`). */
  param?: string;
}

function formatPagePath(
  routePattern: string,
  pageNum: number,
  isRestParam: boolean,
  paramName: string,
  extraParams: Params | undefined,
  base: string,
  trailingSlash: "always" | "never" | "ignore",
): string {
  let resolved = routePattern;
  if (extraParams) {
    for (const [key, val] of Object.entries(extraParams)) {
      const replacement = val === undefined ? "" : String(val);
      resolved = resolved
        .replace(`[...${key}]`, replacement)
        .replace(`[${key}]`, replacement);
    }
  }
  const pageSegment = pageNum === 1 && isRestParam ? "" : String(pageNum);
  resolved = resolved
    .replace(`[...${paramName}]`, pageSegment)
    .replace(`[${paramName}]`, pageSegment);

  const normalizedBase =
    base && base !== "/" ? `/${base.replace(/^\/+|\/+$/g, "")}` : "";
  let full = `${normalizedBase}/${resolved}`.replace(/\/+/g, "/");
  if (full.length > 1 && full.endsWith("/")) {
    full = full.slice(0, -1);
  }
  if (!full.startsWith("/")) {
    full = `/${full}`;
  }
  if (trailingSlash === "always" && !full.endsWith("/")) {
    full = `${full}/`;
  } else if (
    trailingSlash === "never" &&
    full.length > 1 &&
    full.endsWith("/")
  ) {
    full = full.slice(0, -1);
  }
  return full;
}

export function createPaginate(
  routePattern = "[...page]",
  options: CreatePaginateOptions = {},
): PaginateFunction {
  const paramName = options.param ?? "page";
  const base = options.base ?? "";
  const trailingSlash = options.trailingSlash ?? "ignore";
  const isRestParam =
    routePattern.includes(`[...${paramName}]`) ||
    !routePattern.includes(`[${paramName}]`);

  return function paginate<
    T,
    PaginateProps extends Props = Props,
    PaginateParams extends Params = Params,
  >(
    data: readonly T[],
    args: PaginateOptions<PaginateProps, PaginateParams> = {},
  ) {
    const pageSize = args.pageSize ?? 10;
    if (!Number.isFinite(pageSize) || pageSize <= 0) {
      throw new Error(
        `Invalid pageSize: ${String(pageSize)}. Expected a positive number.`,
      );
    }
    const size = Math.trunc(pageSize);
    const total = data.length;
    const lastPage = Math.max(1, Math.ceil(total / size));
    const extraParams = args.params;
    const extraProps = args.props;

    const urlFor = (pageNum: number): string =>
      formatPagePath(
        routePattern,
        pageNum,
        isRestParam,
        paramName,
        extraParams,
        base,
        trailingSlash,
      );

    const results: GetStaticPathsResult<
      PaginateProps & { page: Page<T> },
      PaginateParams & { page?: string }
    > = [];

    for (let pageNum = 1; pageNum <= lastPage; pageNum++) {
      const start = (pageNum - 1) * size;
      const end = total === 0 ? -1 : Math.min(start + size - 1, total - 1);
      const slice = total === 0 ? [] : data.slice(start, end + 1);

      const pageParamValue =
        pageNum === 1 && isRestParam ? undefined : String(pageNum);

      const params = {
        ...extraParams,
        [paramName]: pageParamValue,
      } as PaginateParams & { page?: string };

      const page: Page<T> = {
        data: slice,
        start,
        end,
        size,
        total,
        currentPage: pageNum,
        lastPage,
        url: {
          current: urlFor(pageNum),
          prev: pageNum > 1 ? urlFor(pageNum - 1) : undefined,
          next: pageNum < lastPage ? urlFor(pageNum + 1) : undefined,
          first: pageNum > 1 ? urlFor(1) : undefined,
          last: pageNum < lastPage ? urlFor(lastPage) : undefined,
        },
      };

      const props = {
        ...extraProps,
        page,
      } as PaginateProps & { page: Page<T> };

      results.push({ params, props });
    }

    return results;
  };
}

/** Default Astro `paginate()` helper using `[...page]` rest-parameter semantics. */
export const paginate: PaginateFunction = createPaginate("[...page]");
