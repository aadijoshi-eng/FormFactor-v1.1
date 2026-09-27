import assert from "node:assert/strict";
import test from "node:test";
import dataset from "../src/data/formfactor-data.json" with { type: "json" };
import { DEFAULT_WEIGHTS, FORMAT_INFO, scoreFormats, updateWeightPreservingPositiveTotal } from "../src/lib/model.ts";

const FORMAT_KEYS = ["apartments", "townhomes", "detached", "mixedUse", "masterPlanned"];

test("county scores include all five housing formats", () => {
  const county = dataset.counties.find((candidate) => candidate.countyFips === "37119");
  assert.ok(county);
  const scores = scoreFormats(county, dataset.counties, DEFAULT_WEIGHTS);
  assert.equal(scores.length, FORMAT_KEYS.length);
  assert.deepEqual(new Set(scores.map((entry) => entry.key)), new Set(FORMAT_KEYS));
  assert.ok(scores.every((entry) => entry.score >= 0 && entry.score <= 100));
  assert.ok(scores.every((entry) => entry.name === FORMAT_INFO[entry.key].name));
});

test("at least one slider stays above zero", () => {
  const onePositive = Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((key) => [key, key === "affordability" ? 1 : 0]));
  const protectedUpdate = updateWeightPreservingPositiveTotal(onePositive, "affordability", 0);
  assert.equal(protectedUpdate.affordability, 1);

  const twoPositive = { ...onePositive, density: 7 };
  const allowedZero = updateWeightPreservingPositiveTotal(twoPositive, "affordability", 0);
  assert.equal(allowedZero.affordability, 0);
  assert.equal(allowedZero.density, 7);
});

test("bundled communities produce finite factor scores", () => {
  for (const peers of [dataset.metros, dataset.counties]) {
    for (const row of peers) {
      const scores = scoreFormats(row, peers, DEFAULT_WEIGHTS);
      assert.equal(scores.length, 5);
      for (const item of scores) {
        assert.ok(Number.isFinite(item.score) && item.score >= 0 && item.score <= 100, row.name);
        assert.equal(Object.keys(item.factors).length, 9);
        assert.ok(Object.values(item.factors).every((value) => Number.isFinite(value) && value >= 0 && value <= 100), row.name);
      }
    }
  }
});

test("all nine weights affect the result", () => {
  const county = dataset.counties.find((row) => row.countyFips === "37119");
  const baseline = scoreFormats(county, dataset.counties, DEFAULT_WEIGHTS);
  const doubled = Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([key, value]) => [key, value * 2]));
  assert.deepEqual(scoreFormats(county, dataset.counties, doubled), baseline);

  for (const factor of Object.keys(DEFAULT_WEIGHTS)) {
    const changed = { ...DEFAULT_WEIGHTS, [factor]: DEFAULT_WEIGHTS[factor] === 30 ? 0 : 30 };
    assert.notDeepEqual(
      scoreFormats(county, dataset.counties, changed).map((score) => [score.key, score.score]),
      baseline.map((score) => [score.key, score.score]),
      factor,
    );
  }
});
