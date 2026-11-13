import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DataTable, type DataTableColumn, type DataTableSort } from "@moa/ui";

/**
 * Sorting by a column header (packages/ui DataTable): the table sorts the
 * rows it has when every row is loaded, or asks the server for another order
 * on a paged list; the header says which way it runs (aria-sort), and a third
 * click goes back to the list's own order. Blank values go last either way.
 */
interface Row {
  id: number;
  name: string;
  amount: number | null;
}

const rows: Row[] = [
  { id: 1, name: "Chitra", amount: 250 },
  { id: 2, name: "asha", amount: null },
  { id: 3, name: "Bilal", amount: 500 },
];

const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Name", cell: (r) => r.name, sortValue: (r) => r.name },
  { key: "amount", header: "Amount", cell: (r) => String(r.amount ?? "—"), sortValue: (r) => r.amount, firstOrder: "desc" },
  { key: "id", header: "Id", cell: (r) => String(r.id) },
];

const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]!.textContent);

describe("sorting by a column header", () => {
  it("sorts the rows it has: A to Z, Z to A, then back to the list's own order", () => {
    render(<DataTable columns={columns} data={rows} rowKey={(r) => r.id} />);
    expect(names()).toEqual(["Chitra", "asha", "Bilal"]);
    const header = screen.getByRole("columnheader", { name: /Name/ });
    expect(header).toHaveAttribute("aria-sort", "none");
    fireEvent.click(within(header).getByRole("button"));
    expect(names()).toEqual(["asha", "Bilal", "Chitra"]);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(within(header).getByRole("button"));
    expect(names()).toEqual(["Chitra", "Bilal", "asha"]);
    expect(header).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(within(header).getByRole("button"));
    expect(names()).toEqual(["Chitra", "asha", "Bilal"]);
    // A column without a sort value is a plain header.
    expect(within(screen.getByRole("columnheader", { name: "Id" })).queryByRole("button")).toBeNull();
  });

  it("starts amounts largest first and keeps blanks last either way", () => {
    render(<DataTable columns={columns} data={rows} rowKey={(r) => r.id} />);
    const header = screen.getByRole("columnheader", { name: /Amount/ });
    fireEvent.click(within(header).getByRole("button"));
    expect(names()).toEqual(["Bilal", "Chitra", "asha"]);
    fireEvent.click(within(header).getByRole("button"));
    expect(names()).toEqual(["Chitra", "Bilal", "asha"]);
  });

  it("asks the server on a paged list, and shows the order it was given", () => {
    const onSortChange = vi.fn<(next: DataTableSort | null) => void>();
    const serverColumns: DataTableColumn<Row>[] = [
      { key: "name", header: "Name", cell: (r) => r.name, sortable: true },
      { key: "amount", header: "Amount", cell: (r) => String(r.amount ?? "—"), sortable: true, firstOrder: "desc" },
    ];
    function Harness() {
      const [sort, setSort] = React.useState<DataTableSort | null>(null);
      return (
        <DataTable
          columns={serverColumns}
          data={rows}
          rowKey={(r) => r.id}
          sort={sort}
          onSortChange={(next) => {
            onSortChange(next);
            setSort(next);
          }}
        />
      );
    }
    render(<Harness />);
    const amount = screen.getByRole("columnheader", { name: /Amount/ });
    fireEvent.click(within(amount).getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: "amount", order: "desc" });
    expect(amount).toHaveAttribute("aria-sort", "descending");
    // The server sorts: the rows stay as they came.
    expect(names()).toEqual(["Chitra", "asha", "Bilal"]);
    fireEvent.click(within(amount).getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: "amount", order: "asc" });
    fireEvent.click(within(amount).getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith(null);
  });
});
