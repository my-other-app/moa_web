import { tableOf, type CsvColumn } from "./csv";
import { EXPORT_MIME, saveBlob } from "./export-format";

/**
 * Excel for the exports the browser builds itself (the check-in log, the
 * swag handovers, the deliveries, the admin's lists): the same rows and
 * columns as their CSV (`tableOf`), written as an .xlsx.
 *
 * The writer and its zip library are imported here, on the click, and not
 * before: no page carries them until someone asks for an Excel file.
 */
export async function toXlsxBytes<T>(rows: readonly T[], columns: readonly CsvColumn<T>[], options: { sheet?: string } = {}): Promise<Uint8Array> {
  const { toXlsx } = await import("./xlsx");
  return toXlsx({ ...tableOf(rows, columns), sheet: options.sheet });
}

/** Builds the workbook and hands it to the browser's downloads as `filename`. */
export async function downloadXlsx<T>(filename: string, rows: readonly T[], columns: readonly CsvColumn<T>[], options: { sheet?: string } = {}): Promise<void> {
  const bytes = await toXlsxBytes(rows, columns, options);
  saveBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: EXPORT_MIME.xlsx }), filename);
}
