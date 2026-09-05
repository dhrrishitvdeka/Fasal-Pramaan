import { describe, expect, it } from "vitest";
import { OSM_TILE_ATTRIBUTION, OSM_TILE_URL } from "../src/lib/map-tiles";

describe("reviewer map tiles", () => {
  it("uses HTTPS OpenStreetMap tiles, not a file or blocked local path", () => {
    expect(OSM_TILE_URL.startsWith("https://")).toBe(true);
    expect(OSM_TILE_URL).toContain("tile.openstreetmap.org");
    expect(OSM_TILE_URL).not.toMatch(/^file:/);
    expect(OSM_TILE_ATTRIBUTION).toMatch(/openstreetmap/i);
  });
});
