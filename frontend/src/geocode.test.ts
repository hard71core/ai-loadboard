import { describe, expect, it } from "vitest";
import { haversineMiles } from "./geocode";

describe("haversineMiles", () => {
  it("returns ~0 for the same point", () => {
    const point = { lat: 32.7767, lng: -96.797 };
    expect(haversineMiles(point, point)).toBeCloseTo(0, 5);
  });

  it("matches the known great-circle distance for Dallas -> Houston", () => {
    // ~225 mi as the crow flies (not the ~240 mi driving distance the
    // real-route feature reports — this function is the straight-line
    // fallback/caption, see its docstring in geocode.ts).
    const dallas = { lat: 32.7767, lng: -96.797 };
    const houston = { lat: 29.7604, lng: -95.3698 };
    expect(haversineMiles(dallas, houston)).toBeCloseTo(225, -1);
  });

  it("is symmetric", () => {
    const a = { lat: 40.7128, lng: -74.006 };
    const b = { lat: 34.0522, lng: -118.2437 };
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 10);
  });
});
