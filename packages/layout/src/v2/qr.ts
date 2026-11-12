import QRCode from "qrcode";

/**
 * The QR as the backend draws it (app/core/doc_designs/qr.py): error
 * correction M, the quiet zone as a border of blank modules, one path of
 * whole-module runs on a white square, crisp edges.
 */

/** A QR code's modules, row by row, its border included: true is dark. */
export type QrMatrix = boolean[][];

/** The modules for a payload, with `border` blank modules round them. */
export const qrMatrix = (payload: string, border = 0): QrMatrix => {
  const q = QRCode.create(payload, { errorCorrectionLevel: "M" });
  const n = q.modules.size;
  const size = n + 2 * border;
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const r = y - border;
      const c = x - border;
      return r >= 0 && c >= 0 && r < n && c < n ? !!q.modules.get(r, c) : false;
    }),
  );
};

/** The matrix as an SVG document: `doc_designs.qr.svg`. */
export const qrMatrixSvg = (matrix: QrMatrix): string => {
  const n = matrix.length;
  const runs: string[] = [];
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < n) {
      if (row[x]) {
        const start = x;
        while (x < n && row[x]) x++;
        runs.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
      } else x++;
    }
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">` +
    `<rect width="${n}" height="${n}" fill="#fff"/><path fill="#000" d="${runs.join("")}"/></svg>`
  );
};

/** The QR for a payload as SVG, `quietZone` modules round it. */
export const qrSvgOf = (payload: string, quietZone: number): string => qrMatrixSvg(qrMatrix(payload, quietZone));
