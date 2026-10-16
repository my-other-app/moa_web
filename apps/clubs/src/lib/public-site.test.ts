import { describe, expect, it } from "vitest";

import { publicUrl } from "@/features/events";

import { PUBLIC_SITE, PUBLIC_SITE_HOST, clubPublicUrl, eventPublicUrl } from "./public-site";

describe("the public site's addresses", () => {
  it("is the apex domain, with events and clubs under their own paths", () => {
    expect(PUBLIC_SITE).toBe("https://myotherapp.in");
    expect(PUBLIC_SITE_HOST).toBe("myotherapp.in");
    expect(eventPublicUrl("hack-night-04")).toBe("https://myotherapp.in/events/hack-night-04");
    expect(clubPublicUrl("circuit-society")).toBe("https://myotherapp.in/clubs/circuit-society");
  });

  it("links an event row by its slug, and by its id until it has one (the site redirects that)", () => {
    expect(publicUrl({ id: 37, slug: "hack-night-04" })).toBe("https://myotherapp.in/events/hack-night-04");
    expect(publicUrl({ id: 37, slug: null })).toBe("https://myotherapp.in/37");
    expect(publicUrl({ id: 37 })).toBe("https://myotherapp.in/37");
  });
});
