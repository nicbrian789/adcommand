import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  costPerResult,
  ctr,
  formatCpr,
  rankByExpensiveCpr,
  type RankedCampaign,
} from "./metrics";

describe("AI assistant metrics", () => {
  it("computes CPR and leaves null when no conversions", () => {
    assert.equal(costPerResult(100, 4), 25);
    assert.equal(costPerResult(50, 0), null);
    assert.equal(formatCpr(null), "n/a (belum ada konversi)");
    assert.equal(formatCpr(12.5), "$12.50");
  });

  it("computes CTR", () => {
    assert.equal(ctr(5, 1000), 0.005);
    assert.equal(ctr(1, 0), null);
  });

  it("ranks expensive CPR first, then high spend without conversions", () => {
    const rows: RankedCampaign[] = [
      {
        id: "a",
        name: "cheap",
        networkId: "n1",
        networkName: "N",
        provider: "trafficstars",
        status: "Running",
        spend: 10,
        impressions: 100,
        clicks: 2,
        conversions: 2,
        revenue: 0,
        cpr: 5,
        ctr: 0.02,
      },
      {
        id: "b",
        name: "expensive",
        networkId: "n1",
        networkName: "N",
        provider: "trafficstars",
        status: "Running",
        spend: 100,
        impressions: 100,
        clicks: 2,
        conversions: 1,
        revenue: 0,
        cpr: 100,
        ctr: 0.02,
      },
      {
        id: "c",
        name: "no-conv",
        networkId: "n1",
        networkName: "N",
        provider: "adsterra",
        status: "Running",
        spend: 80,
        impressions: 100,
        clicks: 2,
        conversions: 0,
        revenue: 0,
        cpr: null,
        ctr: 0.02,
      },
    ];
    const ranked = rankByExpensiveCpr(rows);
    assert.deepEqual(
      ranked.map((r) => r.id),
      ["b", "a", "c"]
    );
  });
});
