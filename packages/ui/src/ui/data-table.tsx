import * as React from "react";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";

import { Checkbox } from "./checkbox";
import { cn } from "../lib/cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  /**
   * The value this column sorts by, when the table sorts the rows it has
   * (every row loaded). Blank values go last either way.
   */
  sortValue?: (row: T) => string | number | Date | boolean | null | undefined;
  /** The server sorts by this column (the table's `onSortChange` asks it to). */
  sortable?: boolean;
  /** The first click's order: "asc" (the default), or "desc" for dates and amounts. */
  firstOrder?: SortOrder;
}

export type SortOrder = "asc" | "desc";
export interface DataTableSort {
  key: string;
  order: SortOrder;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[] | undefined;
  rowKey: (row: T) => React.Key;
  isLoading?: boolean;
  isError?: boolean;
  emptyMessage?: React.ReactNode;
  loadingMessage?: React.ReactNode;
  errorMessage?: React.ReactNode;
  className?: string;
  /**
   * Opt-in row selection. Omitting `selection` renders exactly the table it
   * did before, so the pages that do not offer bulk actions are unaffected.
   */
  selection?: {
    selected: ReadonlySet<React.Key>;
    onChange: (next: Set<React.Key>) => void;
    /** Rows that cannot be acted on, e.g. a club that is already approved. */
    isSelectable?: (row: T) => boolean;
  };
  /**
   * Sorting by a column header. With `onSortChange`, the server sorts: the
   * table shows `sort` and asks for another order (a paged list must, or it
   * would sort one page). Without it, columns with a `sortValue` sort the
   * rows the table has, starting from `defaultSort`.
   */
  sort?: DataTableSort | null;
  onSortChange?: (next: DataTableSort | null) => void;
  defaultSort?: DataTableSort | null;
}

function compareValues(a: unknown, b: unknown): number {
  const blank = (v: unknown) => v === null || v === undefined || v === "";
  if (blank(a) || blank(b)) return blank(a) === blank(b) ? 0 : blank(a) ? 1 : -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

/** The next order for a header clicked: its first order, then the other way, then none. */
function nextSort(current: DataTableSort | null | undefined, key: string, first: SortOrder): DataTableSort | null {
  if (!current || current.key !== key) return { key, order: first };
  if (current.order === first) return { key, order: first === "asc" ? "desc" : "asc" };
  return null;
}

function DataTable<T>({
  columns,
  data,
  rowKey,
  isLoading = false,
  isError = false,
  emptyMessage = "No results found.",
  loadingMessage = "Loading...",
  errorMessage = "Something went wrong. Please try again.",
  className,
  selection,
  sort,
  onSortChange,
  defaultSort = null,
}: DataTableProps<T>) {
  const colSpan = columns.length + (selection ? 1 : 0);
  const serverSorts = Boolean(onSortChange);
  const [localSort, setLocalSort] = React.useState<DataTableSort | null>(defaultSort);
  const activeSort = serverSorts ? (sort ?? null) : localSort;
  const sortedData = React.useMemo(() => {
    if (serverSorts || !data || !activeSort) return data;
    const column = columns.find((c) => c.key === activeSort.key);
    if (!column?.sortValue) return data;
    const value = column.sortValue;
    const dir = activeSort.order === "asc" ? 1 : -1;
    // A copy: the caller's array is left as it came. Blank values last either way.
    return [...data].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const blankA = va === null || va === undefined || va === "";
      const blankB = vb === null || vb === undefined || vb === "";
      if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;
      return compareValues(va, vb) * dir;
    });
  }, [serverSorts, data, activeSort, columns]);
  const canSort = (c: DataTableColumn<T>) => (serverSorts ? Boolean(c.sortable) : Boolean(c.sortValue));
  const clickSort = (c: DataTableColumn<T>) => {
    const next = nextSort(activeSort, c.key, c.firstOrder ?? "asc");
    if (serverSorts) onSortChange?.(next);
    else setLocalSort(next);
  };

  const selectableRows = React.useMemo(
    () => (data ?? []).filter((row) => selection?.isSelectable?.(row) ?? true),
    [data, selection]
  );
  const selectableKeys = selectableRows.map(rowKey);
  // "All" means every selectable row on this page, not every row in the
  // result set -- selecting rows you cannot see is how bulk actions surprise
  // people.
  const allSelected =
    selectableKeys.length > 0 &&
    selectableKeys.every((key) => selection?.selected.has(key));
  const someSelected =
    !allSelected && selectableKeys.some((key) => selection?.selected.has(key));

  function toggleAll(checked: boolean) {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const key of selectableKeys) {
      if (checked) next.add(key);
      else next.delete(key);
    }
    selection.onChange(next);
  }

  function toggleRow(key: React.Key, checked: boolean) {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (checked) next.add(key);
    else next.delete(key);
    selection.onChange(next);
  }

  return (
    <Table className={className}>
      <TableHeader className="sticky top-0 z-10 bg-secondary shadow-sm">
        <TableRow>
          {selection ? (
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => toggleAll(checked === true)}
                disabled={selectableKeys.length === 0}
                aria-label="Select all rows on this page"
              />
            </TableHead>
          ) : null}
          {columns.map((column) => {
            if (!canSort(column)) {
              return (
                <TableHead key={column.key} className={column.headerClassName}>
                  {column.header}
                </TableHead>
              );
            }
            const on = activeSort?.key === column.key ? activeSort.order : null;
            const Icon = on === "asc" ? ArrowUpIcon : on === "desc" ? ArrowDownIcon : ArrowUpDownIcon;
            return (
              <TableHead
                key={column.key}
                className={column.headerClassName}
                aria-sort={on === "asc" ? "ascending" : on === "desc" ? "descending" : "none"}
              >
                <button
                  type="button"
                  onClick={() => clickSort(column)}
                  className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {column.header}
                  <Icon aria-hidden="true" className={cn("size-3.5", on ? "opacity-100" : "opacity-40")} />
                </button>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell
              colSpan={colSpan}
              className="py-10 text-center text-muted-foreground"
            >
              {loadingMessage}
            </TableCell>
          </TableRow>
        ) : isError ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="py-10 text-center text-destructive">
              {errorMessage}
            </TableCell>
          </TableRow>
        ) : !sortedData || sortedData.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={colSpan}
              className="py-10 text-center text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          sortedData.map((row) => {
            const key = rowKey(row);
            const selectable = selection?.isSelectable?.(row) ?? true;
            const isSelected = selection?.selected.has(key) ?? false;
            return (
            <TableRow
              key={key}
              data-state={isSelected ? "selected" : undefined}
              className={cn(isSelected && "bg-accent/40")}
            >
              {selection ? (
                <TableCell className="w-10">
                  <Checkbox
                    checked={isSelected}
                    disabled={!selectable}
                    onCheckedChange={(checked) => toggleRow(key, checked === true)}
                    aria-label="Select row"
                  />
                </TableCell>
              ) : null}
              {columns.map((column) => (
                <TableCell key={column.key} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

export { DataTable };
