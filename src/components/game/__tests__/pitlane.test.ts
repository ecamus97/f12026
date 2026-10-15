import { describe, expect, it } from "vitest";
import { sectorFraction, PIT_ENTRY, PIT_BOX } from "../TrackMap";

describe("pit lap on the map", () => {
  it("keeps full speed until the pit entry and only stops for the real stop time", () => {
    // 90 s lap on track + 24 s in the pit lane (2.5 s of it stationary)
    const pit = 24;
    const sectors = [30, 30, 30 + pit];
    const from = 0;
    const to = 90 + pit;
    const at = (t: number) => sectorFraction(from, to, sectors, t, pit, 2.5);
    // same speed in S3 before the pit entry as in S1
    const v1 = (at(20) - at(10)) / 10;
    const v3 = (at(80) - at(70)) / 10;
    expect(Math.abs(v3 - v1)).toBeLessThan(1e-9);
    // reaches the pit entry at the normal time
    const entryTime = 60 + 30 * (PIT_ENTRY - 2 / 3) * 3;
    expect(at(entryTime - 0.01)).toBeLessThan(PIT_ENTRY);
    expect(at(entryTime + 0.01)).toBeGreaterThan(PIT_ENTRY);
    // stationary only ~2.5 s
    let still = 0;
    for (let t = entryTime; t < to; t += 0.05) if (at(t) === PIT_BOX) still += 0.05;
    expect(still).toBeGreaterThan(2.3);
    expect(still).toBeLessThan(2.8);
    expect(at(to)).toBeCloseTo(1, 5);
  });
});
