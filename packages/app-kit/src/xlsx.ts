import { strToU8, zipSync } from "fflate";

/**
 * A small Excel (.xlsx) writer for the exports the browser builds itself.
 *
 * Loaded only when someone picks "Download Excel" (`table-export.ts` imports
 * it dynamically), so neither it nor fflate is in any page's bundle.
 *
 * An .xlsx is a zip of a few XML parts; this writes the fewest a workbook
 * needs -- one sheet, a bold frozen header row, column widths -- and
 * nothing else. Deliberately:
 *
 * - Text is written as inline strings (`t="inlineStr"`), which a spreadsheet
 *   shows as written and never evaluates: a guest named `=HYPERLINK(...)`
 *   stays that text. There is no `<f>` anywhere in what this writes.
 * - Finite numbers are number cells, so a column of amounts sums.
 * - Everything is XML-escaped, and characters XML 1.0 can't carry (control
 *   characters, lone surrogates) are dropped rather than producing a file
 *   Excel refuses to open. A cell is cut at Excel's 32,767-character limit.
 *
 * Self-contained on purpose (no imports but fflate), so it can be run and
 * checked on its own.
 */

export interface XlsxTable {
  headers: readonly string[];
  body: readonly (readonly unknown[])[];
  /** The tab's name; cleaned to what Excel allows. */
  sheet?: string;
}

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Excel's own limit on a cell's text. */
export const MAX_CELL_CHARS = 32767;

/** Characters XML 1.0 allows; everything else (C0 controls but tab/LF/CR, U+FFFE/FFFF, lone surrogates) is dropped. */
const ILLEGAL_XML = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

export function xmlText(value: string): string {
  return value
    .replace(ILLEGAL_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A sheet name Excel accepts: none of []:*?/\, not blank, at most 31 characters. */
export function sheetName(name: string | undefined): string {
  const clean = (name ?? "").replace(ILLEGAL_XML, "").replace(/[[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31).trim();
  return clean || "Sheet1";
}

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function columnName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** What a value is written as: a number cell, text, or nothing. */
function cellOf(value: unknown): { kind: "n"; v: number } | { kind: "s"; v: string } | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? { kind: "n", v: value } : { kind: "s", v: String(value) };
  if (typeof value === "bigint") return { kind: "s", v: value.toString() };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : { kind: "s", v: value.toISOString() };
  const text = typeof value === "string" ? value : typeof value === "boolean" ? String(value) : typeof value === "object" ? JSON.stringify(value) : String(value);
  return text === "" ? null : { kind: "s", v: text.length > MAX_CELL_CHARS ? text.slice(0, MAX_CELL_CHARS) : text };
}

function cellXml(ref: string, value: unknown, style?: number): string {
  const cell = cellOf(value);
  if (!cell) return "";
  const s = style ? ` s="${style}"` : "";
  if (cell.kind === "n") return `<c r="${ref}"${s} t="n"><v>${cell.v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlText(cell.v)}</t></is></c>`;
}

/** A width that fits the longest value in the column (the header included), within reason. */
function widths(table: XlsxTable, columns: number): number[] {
  const out: number[] = [];
  for (let c = 0; c < columns; c++) {
    let longest = (table.headers[c] ?? "").length;
    for (const row of table.body) {
      const cell = cellOf(row[c]);
      if (!cell) continue;
      const text = cell.kind === "n" ? String(cell.v) : cell.v;
      // The longest line, for a cell that wraps.
      for (const line of text.split(/\r?\n/)) longest = Math.max(longest, line.length);
    }
    out.push(Math.min(60, Math.max(8, longest + 2)));
  }
  return out;
}

function sheetXml(table: XlsxTable): string {
  const columns = Math.max(table.headers.length, ...table.body.map((r) => r.length), 1);
  const lastRow = table.body.length + 1;
  const ref = `A1:${columnName(columns - 1)}${lastRow}`;
  const cols = widths(table, columns)
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const header = `<row r="1">${table.headers.map((h, c) => cellXml(`${columnName(c)}1`, h, 1)).join("")}</row>`;
  const rows = table.body
    .map((row, i) => {
      const r = i + 2;
      return `<row r="${r}">${row.map((v, c) => cellXml(`${columnName(c)}${r}`, v)).join("")}</row>`;
    })
    .join("");
  return (
    XML_HEAD +
    `<worksheet xmlns="${MAIN}" xmlns:r="${REL}">` +
    `<dimension ref="${ref}"/>` +
    // The header row stays in view while the rest scrolls.
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${header}${rows}</sheetData>` +
    `</worksheet>`
  );
}

const CONTENT_TYPES =
  XML_HEAD +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  XML_HEAD +
  `<Relationships xmlns="${PKG_REL}">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const WORKBOOK_RELS =
  XML_HEAD +
  `<Relationships xmlns="${PKG_REL}">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

/** Two cell formats: 0 the default, 1 bold (the header). */
const STYLES =
  XML_HEAD +
  `<styleSheet xmlns="${MAIN}">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

const workbookXml = (name: string) =>
  XML_HEAD + `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="${xmlText(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

/** The workbook's parts, by path, as text: what goes into the zip. */
export function xlsxParts(table: XlsxTable): Record<string, string> {
  return {
    "[Content_Types].xml": CONTENT_TYPES,
    "_rels/.rels": ROOT_RELS,
    "xl/workbook.xml": workbookXml(sheetName(table.sheet)),
    "xl/_rels/workbook.xml.rels": WORKBOOK_RELS,
    "xl/styles.xml": STYLES,
    "xl/worksheets/sheet1.xml": sheetXml(table),
  };
}

/** The .xlsx file itself. */
export function toXlsx(table: XlsxTable): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [path, xml] of Object.entries(xlsxParts(table))) files[path] = strToU8(xml);
  return zipSync(files, { level: 6 });
}
