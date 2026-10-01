import * as React from "react";

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
}: DataTableProps<T>) {
  const colSpan = columns.length;

  return (
    <Table className={className}>
      <TableHeader className="sticky top-0 z-10 bg-secondary shadow-sm">
        <TableRow>
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
          data.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((column) => (
                <TableCell key={column.key} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export { DataTable };
