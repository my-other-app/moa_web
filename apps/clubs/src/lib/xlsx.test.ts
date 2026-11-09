import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { tableOf, toCsv, toXlsxBytes, type CsvColumn } from "@moa/app-kit";

/**
 * The Excel writer in @moa/app-kit (`xlsx.ts`, loaded on the click through
 * `toXlsxBytes`), for the exports the browser builds itself. Tested here: the
 * package has no runner of its own.
 */
interface Row {
  name: string;
  email: string | null;
  amount: number;
  note: string;
}

const COLUMNS: CsvColumn<Row>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Email", value: (r) => r.email },
  { header: "Amount", value: (r) => r.amount },
  { header: "Note", value: (r) => r.note },
];

const ROWS: Row[] = [
  { name: "Asha Rao", email: "asha@example.com", amount: 499, note: '=HYPERLINK("http://evil.example","click me")' },
  { name: "Bilal <Khan> & \"co\"", email: null, amount: -12.5, note: "line one\nline two" },
  { name: "Bad\u0001chars\u0008here￾\uD800", email: "x@y.z", amount: 0, note: "+SUM(A1:A2)" },
];

async function workbook(rows = ROWS, sheet?: string) {
  const bytes = await toXlsxBytes(rows, COLUMNS, { sheet });
  const files = unzipSync(bytes);
  const text = (path: string) => strFromU8(files[path]!);
  return { bytes, files, text, sheet: text("xl/worksheets/sheet1.xml") };
}

describe("the xlsx writer", () => {
  it("writes a zip with exactly the parts a workbook needs", async () => {
    const { bytes, files, text } = await workbook();
    // A zip: "PK\x03\x04".
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
    expect(text("[Content_Types].xml")).toContain('PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"');
    expect(text("_rels/.rels")).toContain('Target="xl/workbook.xml"');
    expect(text("xl/_rels/workbook.xml.rels")).toContain('Target="worksheets/sheet1.xml"');
    expect(text("xl/_rels/workbook.xml.rels")).toContain('Target="styles.xml"');
  });

  it("writes text as inline strings, never a formula: =HYPERLINK(...) stays text", async () => {
    const { sheet } = await workbook();
    expect(sheet).not.toContain("<f>");
    expect(sheet).not.toContain("<f ");
    expect(sheet).toContain('<c r="D2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;http://evil.example&quot;,&quot;click me&quot;)</t></is></c>');
    expect(sheet).toContain('<c r="D4" t="inlineStr"><is><t xml:space="preserve">+SUM(A1:A2)</t></is></c>');
    // No shared strings table, so no other way for text to be read as anything else.
    expect(sheet).not.toMatch(/t="(s|str|e)"/);
  });

  it("writes numbers as number cells, and leaves empty values out", async () => {
    const { sheet } = await workbook();
    expect(sheet).toContain('<c r="C2" t="n"><v>499</v></c>');
    expect(sheet).toContain('<c r="C3" t="n"><v>-12.5</v></c>');
    expect(sheet).toContain('<c r="C4" t="n"><v>0</v></c>');
    // Bilal has no email: no B3 cell at all.
    expect(sheet).not.toContain('r="B3"');
  });

  it("escapes XML and drops the characters XML can't carry", async () => {
    const { sheet } = await workbook();
    expect(sheet).toContain("Bilal &lt;Khan&gt; &amp; &quot;co&quot;");
    expect(sheet).toContain('<t xml:space="preserve">Badcharshere</t>');
    expect(sheet).toContain("line one\nline two");
    expect(sheet).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/);
  });

  it("makes the header row bold and keeps it in view", async () => {
    const { sheet, text } = await workbook();
    expect(sheet).toContain('<row r="1"><c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Name</t></is></c>');
    const styles = text("xl/styles.xml");
    // Style 1 is font 1, and font 1 is bold.
    expect(styles).toContain('<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>');
    expect(styles).toMatch(/<fonts count="2"><font>(?:(?!<b\/>).)*?<\/font><font><b\/>/);
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
  });

  it("sizes the columns to what is in them, within bounds, and records the range", async () => {
    const { sheet } = await workbook();
    expect(sheet).toContain('<dimension ref="A1:D4"/>');
    const widths = [...sheet.matchAll(/<col min="(\d+)" max="\d+" width="(\d+)"/g)].map((m) => Number(m[2]));
    expect(widths).toHaveLength(4);
    expect(widths.every((w) => w >= 8 && w <= 60)).toBe(true);
    // "Note" holds the longest text.
    expect(Math.max(...widths)).toBe(widths[3]);
  });

  it("names the sheet as Excel allows and cuts a cell at Excel's limit", async () => {
    const long: Row = { name: "x".repeat(40_000), email: null, amount: 1, note: "" };
    const { text, sheet } = await workbook([long], "Check-ins: [Hack/Night]* and a name far too long");
    // []:*?/\\ become spaces; 31 characters at most.
    expect(text("xl/workbook.xml")).toContain('<sheet name="Check-ins   Hack Night   and a" sheetId="1" r:id="rId1"/>');
    const cell = /<c r="A2" t="inlineStr"><is><t xml:space="preserve">(x+)<\/t>/.exec(sheet)![1]!;
    expect(cell.length).toBe(32767);
  });

  it("writes the same headings and values as the CSV of the same export", async () => {
    const { sheet } = await workbook();
    const { headers, body } = tableOf(ROWS, COLUMNS);
    expect(toCsv(ROWS, COLUMNS).split("\r\n")[0]).toBe(headers.join(","));
    for (const [i, h] of headers.entries()) expect(sheet).toContain(`<c r="${"ABCD"[i]}1" s="1" t="inlineStr"><is><t xml:space="preserve">${h}</t>`);
    expect(body[0]).toEqual(["Asha Rao", "asha@example.com", 499, ROWS[0]!.note]);
  });

  it("goes past column Z as AA, AB…", async () => {
    const wide: CsvColumn<number>[] = Array.from({ length: 28 }, (_, i) => ({ header: `C${i + 1}`, value: () => i }));
    const files = unzipSync(await toXlsxBytes([1], wide));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain('<dimension ref="A1:AB2"/>');
    expect(sheet).toContain('<c r="AB2" t="n"><v>27</v></c>');
  });
});
