/**
 * Optional keyed each. Reconciliation visit/move ordering adapted from
 * Svelte's MIT-licensed each.js (copyright 2016–2025 Svelte Contributors).
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to
 * do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import {
  createInsertionRange,
  insertionRangeEnd,
  prepareInsertionRange,
  moveInsertionRange,
  type DOMChild,
} from "@tschk/moonshine-dom/dom";
import {
  createRoot,
  createComponentScope,
  getOwner,
  getRenderScheduler,
  createSignal,
  createRenderMemo,
  onCleanup,
  type Owner,
  type Accessor,
  type Setter,
} from "@tschk/moonshine-dom/reactive";
type Entry<T> = {
  key: unknown;
  node: Node;
  stop: () => void;
  scope: Owner;
  setItem: Setter<T>;
  setIndex: Setter<number>;
  prev: Entry<T> | null;
  next: Entry<T> | null;
  fresh: boolean;
};
/** Source compiler-owned entry; no SSR dispatch or ordinary native policy. */
export function keyedEach<T>(
  read: () => ArrayLike<T> | Iterable<T> | null | undefined,
  key: (item: T, index: number) => unknown,
  map: (item: Accessor<T>, index: Accessor<number>) => DOMChild,
  fallback?: () => DOMChild,
  retain?: (node: Node) => boolean,
): Node {
  const parent = getOwner();
  if (!parent || parent.disposed) throw new Error("Each requires a live owner");
  const group = createComponentScope(() => getOwner()!);
  const scheduler = getRenderScheduler();
  const entries = new Map<unknown, Entry<T>>();
  let first: Entry<T> | null = null,
    last: Entry<T> | null = null,
    initial = true,
    closed = false;
  let empty: Entry<T> | undefined;
  let outer!: Node;
  function unlink(row: Entry<T>) {
    if (row.prev) row.prev.next = row.next;
    else first = row.next;
    if (row.next) row.next.prev = row.prev;
    else last = row.prev;
  }
  function link(row: Entry<T>, prev: Entry<T> | null, next: Entry<T> | null) {
    row.prev = prev;
    row.next = next;
    if (prev) prev.next = row;
    else first = row;
    if (next) next.prev = row;
    else last = row;
  }
  function destroy(rows: Iterable<Entry<T>>) {
    let failed = false,
      failure: unknown;
    for (const row of rows) {
      unlink(row);
      entries.delete(row.key);
      try {
        row.stop();
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    if (failed) throw failure;
  }
  function create(
    value: T,
    index: number,
    id: unknown,
    renderRow = map,
  ): Entry<T> {
    let stopRow: (() => void) | undefined;
    try {
      return createRoot((dispose) => {
        stopRow = dispose;
        const scope = getOwner()!;
        const [item, setItem] = createSignal(value);
        const [position, setIndex] = createSignal(index);
        const build = () => {
          const node = createInsertionRange(
            renderRow(item, position),
            undefined,
            retain,
          );
          prepareInsertionRange(node);
          return node;
        };
        const activeScheduler = getRenderScheduler();
        const node = activeScheduler
          ? activeScheduler.branch(build, position)
          : build();
        if (closed || group.disposed) {
          dispose();
          throw new Error("Each disposed during row setup");
        }
        scope.parent = group;
        group.children.add(scope);
        const row: Entry<T> = {
          key: id,
          node,
          stop: dispose,
          scope,
          setItem,
          setIndex,
          prev: null,
          next: null,
          fresh: true,
        };
        link(row, last, null);
        return row;
      });
    } catch (error) {
      try {
        stopRow?.();
      } catch {}
      throw error;
    }
  }
  function stop() {
    if (closed) return;
    closed = true;
    const rows = [...entries.values()];
    if (empty) rows.push(empty);
    empty = undefined;
    destroy(rows);
  }
  onCleanup(stop);
  const reconcile = () => {
    if (closed) return null;
    const input = read();
    const items = Array.isArray(input) ? input : Array.from(input ?? []);
    const length = items.length;
    const keys = new Set<unknown>();
    const preparedKeys: unknown[] = [];
    const created: Entry<T>[] = [];
    try {
      for (let index = 0; index < length; index++) {
        const value = items[index]!,
          id = key(value, index);
        if (keys.has(id)) throw new Error("Duplicate each key");
        keys.add(id);
        preparedKeys.push(id);
        const row = entries.get(id);
        if (row) {
          row.setItem(() => value);
          row.setIndex(index);
        } else {
          const createdRow = create(value, index, id);
          created.push(createdRow);
          entries.set(id, createdRow);
        }
      }
      if (length && empty) {
        const old = empty;
        empty = undefined;
        unlink(old);
        old.stop();
      }
      if (!initial && (length > 0 || !empty)) {
        let current = first,
          prev: Entry<T> | null = null,
          seen: Set<Entry<T>> | undefined;
        let matched: Entry<T>[] = [],
          stashed: Entry<T>[] = [];
        for (let index = 0; index < length; index++) {
          const id = key(items[index]!, index);
          const prepared = preparedKeys[index];
          if (id !== prepared && !(id !== id && prepared !== prepared))
            throw new Error("Each key changed during reconciliation");
          const row = entries.get(id);
          if (!row) throw new Error("Each key changed during reconciliation");
          if (row.fresh) {
            row.fresh = false;
            if (row === current) {
              moveInsertionRange(row.node, insertionRangeEnd(outer));
            } else {
              const next = prev ? prev.next : current;
              unlink(row);
              link(row, prev, next);
              moveInsertionRange(
                row.node,
                next?.node ?? insertionRangeEnd(outer),
              );
              prev = row;
              matched = [];
              stashed = [];
              current = prev.next;
              continue;
            }
          }
          if (row !== current) {
            if (seen?.has(row)) {
              if (matched.length < stashed.length) {
                const start = stashed[0]!,
                  a = matched[0]!,
                  b = matched[matched.length - 1]!;
                prev = start.prev;
                for (const part of matched)
                  moveInsertionRange(part.node, start.node);
                for (const part of stashed) seen.delete(part);
                const beforeA = a.prev,
                  afterB = b.next;
                if (beforeA) beforeA.next = afterB;
                else first = afterB;
                if (afterB) afterB.prev = beforeA;
                else last = beforeA;
                if (prev) prev.next = a;
                else first = a;
                a.prev = prev;
                b.next = start;
                start.prev = b;
                current = start;
                prev = b;
                index--;
                matched = [];
                stashed = [];
              } else {
                seen.delete(row);
                moveInsertionRange(
                  row.node,
                  current?.node ?? insertionRangeEnd(outer),
                );
                unlink(row);
                const next = prev === null ? first : prev.next;
                link(row, prev, next);
                prev = row;
              }
              continue;
            }
            matched = [];
            stashed = [];
            while (current && current !== row) {
              (seen ??= new Set()).add(current);
              stashed.push(current);
              current = current.next;
            }
            if (!current) continue;
          }
          if (!row.fresh) matched.push(row);
          prev = row;
          current = row.next;
        }
        const removed = [...(seen ?? [])];
        while (current) {
          removed.push(current);
          current = current.next;
        }
        destroy(removed);
      }
      initial = false;
      for (const row of entries.values()) row.fresh = false;
      if (!length && fallback && !empty)
        empty = create(undefined as T, 0, Symbol("fallback"), () => fallback());
      const tokens: Node[] = [];
      for (let row = first; row; row = row.next) tokens.push(row.node);
      // Preserve current source order for child-first owner teardown.
      group.children.clear();
      for (let row = first; row; row = row.next) group.children.add(row.scope);
      scheduler?.reorder();
      return tokens;
    } catch (error) {
      try {
        destroy(created.filter((row) => entries.get(row.key) === row));
      } catch {}
      throw error;
    }
  };
  outer = createInsertionRange(
    reconcile,
    scheduler ? createRenderMemo : undefined,
    retain,
  );
  return outer;
}
