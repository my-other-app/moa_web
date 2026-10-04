import * as React from "react";

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
}: DataTableProps<T>) {
  const colSpan = columns.length + (selection ? 1 : 0);

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
          {columns.map((column) => (
            <TableHead key={column.key} className={column.headerClassName}>
              {column.header}
            </TableHead>
          ))}
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
        ) : !data || data.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={colSpan}
              className="py-10 text-center text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          data.map((row) => {
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
