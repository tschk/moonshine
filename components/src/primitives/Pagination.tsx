import type { HTMLAttributes } from "react";

export type PaginationProps = HTMLAttributes<HTMLElement> & {
  page: number;
  pageCount: number;
  onPageChange?: (page: number) => void;
};

export function Pagination({
  page,
  pageCount,
  onPageChange,
  style,
  ...rest
}: PaginationProps) {
  return (
    <nav
      data-ms="pagination"
      aria-label="Pagination"
      style={{ display: "flex", gap: 8, alignItems: "center", ...style }}
      {...rest}
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange?.(page - 1)}
      >
        Prev
      </button>
      <span>
        {page} / {pageCount}
      </span>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onPageChange?.(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
