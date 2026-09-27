import assert from "node:assert/strict";
import test from "node:test";
import dataset from "../src/data/formfactor-data.json" with { type: "json" };
import { compareMetricRecords, metricDeltaFormat, metricDeltaFromMedian, metricRank } from "../src/lib/metrics.ts";

test("highest and lowest rankings use opposite endpoints", () => {
  const counties = dataset.counties.filter((county) => county.stateFips === "37" && county.medianRent != null);
  const highest = [...counties].sort((a, b) => b.medianRent - a.medianRent)[0];
  const lowest = [...counties].sort((a, b) => a.medianRent - b.medianRent)[0];
  assert.equal(metricRank(highest, counties, "medianRent", "highest").rank, 1);
  assert.equal(metricRank(lowest, counties, "medianRent", "lowest").rank, 1);
  assert.equal(metricRank(highest, counties, "medianRent", "lowest").rank, counties.length);
});

test("equal values use name and ID as tie breakers", () => {
  const records = [
    { geoId: "2", name: "Zulu", medianRent: 900 },
    { geoId: "1", name: "Alpha", medianRent: 900 },
    { geoId: "3", name: "Missing", medianRent: null },
  ];

  for (const direction of ["highest", "lowest"]) {
    const sorted = [...records].sort((a, b) => compareMetricRecords(a, b, "medianRent", direction));
    assert.deepEqual(sorted.map((row) => row.geoId), ["1", "2", "3"]);
    assert.deepEqual(metricRank(records[1], records, "medianRent", direction), { rank: 1, total: 2 });
    assert.equal(metricRank(records[2], records, "medianRent", direction), null);
  }
});

test("percentage differences stay in percentage points", () => {
  const records = [{ geoId: "a", populationGrowth: 2.5 }, { geoId: "b", populationGrowth: 7.5 }];
  const context = metricDeltaFromMedian(records[1], records, "populationGrowth");
  assert.deepEqual(context, { value: 7.5, benchmark: 5, delta: 2.5 });
  assert.equal(metricDeltaFormat("populationGrowth", context.delta), "+2.5 pp");
  assert.equal(metricDeltaFormat("vacancyRate", -1.25), "−1.3 pp");
  assert.equal(metricDeltaFormat("medianRent", -200), "−$200");
});
