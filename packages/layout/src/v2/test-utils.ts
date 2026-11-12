/** Layouts for the tests, as few fields as the schema needs. Not exported from the package. */

export const minimal = (layers: unknown[] = [], more: Record<string, unknown> = {}) => ({
  version: 2,
  page: { widthMm: 101.6, heightMm: 152.4 },
  canvas: { width: 384, height: 576 },
  layers,
  ...more,
});

export const textRaw = (more: Record<string, unknown> = {}) => ({
  kind: "text",
  id: "t1",
  name: "Name",
  x: 10,
  y: 20,
  width: 200,
  height: 40,
  text: "{{attendee_name}}",
  font: { family: "Inter" },
  size: 32,
  ...more,
});
