import { fireEvent, screen } from "@testing-library/react";

/**
 * Opens an export menu (`ExportMenu` from @moa/app-kit) the way a keyboard
 * user does, reads its two choices -- Excel first, then CSV -- and closes it
 * again, so the rest of the page is back for the test's next query (an open
 * Radix menu hides everything outside it).
 */
export async function exportChoices(name: string | RegExp): Promise<{ order: string[]; xlsx: HTMLAnchorElement; csv: HTMLAnchorElement }> {
  const trigger = await screen.findByRole("button", { name });
  fireEvent.keyDown(trigger, { key: "Enter" });
  const items = (await screen.findAllByRole("menuitem")) as HTMLAnchorElement[];
  const order = items.map((i) => i.textContent?.trim() ?? "");
  const xlsx = items.find((i) => i.dataset.format === "xlsx")!;
  const csv = items.find((i) => i.dataset.format === "csv")!;
  fireEvent.keyDown(items[0]!, { key: "Escape" });
  return { order, xlsx, csv };
}

/** Opens an export menu and picks one of its choices: what a click on "Download CSV" or "Download Excel (.xlsx)" does. */
export async function pickExport(name: string | RegExp, format: "xlsx" | "csv"): Promise<void> {
  fireEvent.keyDown(await screen.findByRole("button", { name }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: format === "xlsx" ? "Download Excel (.xlsx)" : "Download CSV" }));
}
