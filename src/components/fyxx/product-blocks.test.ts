import { describe, it, expect } from "vitest";
import { sizedPhotoUrl } from "./product-blocks";

describe("sizedPhotoUrl", () => {
  const url = "https://cdn.shopify.com/s/files/1/x/TGR_Smash_Burger_5.png?v=1760126481";

  it("appends CDN sizing with & (the stored URL already has a ?v= query string)", () => {
    const out = sizedPhotoUrl(url, 400);
    // Must not introduce a second '?', which would break the query string.
    expect(out.indexOf("?")).toBe(out.lastIndexOf("?"));
    expect(out).toBe(`${url}&width=400&height=400&crop=center`);
  });

  it("centre-crops to a square at the requested size", () => {
    expect(sizedPhotoUrl(url, 120)).toContain("&width=120&height=120&crop=center");
  });
});
