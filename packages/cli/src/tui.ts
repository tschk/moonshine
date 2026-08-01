/**
 * Terminal helpers for destructive confirmations.
 *
 * Everything degrades: without a TTY there is no ANSI, and there is no prompt
 * either — a pipe cannot answer a question, and a hung CI job is worse than a
 * failed one.
 */

export type Tui = {
  /** Whether stdout is a terminal. Drives colour and whether prompting is possible. */
  isTTY: boolean;
  /** Usable width, clamped so narrow terminals still align. */
  columns: number;
  write(text: string): void;
  /** Read one line of input. Only called when `isTTY`. */
  prompt(question: string): Promise<string>;
};

const MIN_COLUMNS = 20;
const MAX_COLUMNS = 100;

export function clampColumns(raw: number | undefined): number {
  if (!raw || !Number.isFinite(raw)) return 80;
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.floor(raw)));
}

export function terminalTui(): Tui {
  const isTTY = process.stdout.isTTY === true;
  return {
    isTTY,
    columns: clampColumns(process.stdout.columns),
    write(text) {
      process.stdout.write(text);
    },
    async prompt(question) {
      process.stdout.write(question);
      for await (const line of console) return line;
      return "";
    },
  };
}

/** Cut `text` to `width` columns, marking the cut so nothing looks complete when it is not. */
export function truncate(text: string, width: number): string {
  if (text.length <= width) return text;
  if (width <= 1) return text.slice(0, Math.max(0, width));
  return `${text.slice(0, width - 1)}…`;
}

/**
 * A full-width black-on-yellow bar. One line exactly, never wrapping: the text
 * is truncated to the terminal width before the padding is added, so the bar
 * cannot spill onto a second row and tear.
 */
export function warningBar(text: string, tui: Pick<Tui, "isTTY" | "columns">) {
  const width = tui.columns;
  const body = ` ${truncate(text, Math.max(0, width - 2))} `.padEnd(width, " ");
  return tui.isTTY
    ? `\x1b[30;43m${body}\x1b[0m`
    : `!! ${truncate(text, width - 3)}`;
}
