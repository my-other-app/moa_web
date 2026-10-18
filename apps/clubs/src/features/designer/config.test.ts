import { describe, expect, it } from "vitest";
import { renderTicketTemplate, ticketStarter } from "@moa/layout";

import { DESIGNERS, designSamples } from "./config";

/**
 * The code under the QR on the canvas: the ticket code ({{ticket_code}}, the
 * ticket's own id), sampled in the shape a ticket id is minted in, whatever
 * the server sends -- today's sends no ticket_code at all.
 */
describe("the designer's sample values", () => {
  it("fills {{ticket_code}} on a server from before the token existed", () => {
    // Today's backend: ticket_code was only an alias of admission_no, so its samples have no such key.
    const today = { attendee_name: "Ananya Iyer", admission_no: "MOA-0041-KF26" };
    const samples = designSamples(today);
    expect(samples.ticket_code).toBe("MOA-7K3QF-X9PLM");
    expect(samples.admission_no).toBe("MOA-0041-KF26");
    expect(samples.attendee_name).toBe("Ananya Iyer");
  });

  it("keeps the server's own sample when it is a minted shape, and replaces one that is not", () => {
    expect(designSamples({ ticket_code: "MOA-ABCDE-23456" }).ticket_code).toBe("MOA-ABCDE-23456");
    // The Wave-1 backend samples an id of the old hex-time shape.
    expect(designSamples({ ticket_code: "MOA-2BCEBA8-PFZG3" }).ticket_code).toBe("MOA-7K3QF-X9PLM");
  });

  it("prints the sample ticket code under a starter's QR, and encodes it in the sample QR", () => {
    const code = ticketStarter("classic").layers.find((l) => l.kind === "text" && l.id === "code");
    expect(code && code.kind === "text" ? renderTicketTemplate(code.text, designSamples({})) : null).toBe("MOA-7K3QF-X9PLM");
    expect(DESIGNERS.ticket.sampleQr).toBe("MOA-7K3QF-X9PLM");
    expect(DESIGNERS.badge.sampleQr).toBe("MOA-7K3QF-X9PLM");
  });
});
