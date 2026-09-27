import assert from "node:assert/strict";
import test from "node:test";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import usAtlas from "us-atlas/counties-10m.json" with { type: "json" };
import countyGeometrySupplement from "../src/data/county-geometry-supplement.json" with { type: "json" };
import dataset from "../src/data/formfactor-data.json" with { type: "json" };
import { DEFAULT_WEIGHTS, SCENARIOS, scoreFormats } from "../src/lib/model.ts";

test("nationwide dataset has the documented geography scope", () => {
  assert.equal(dataset.metros.length, 387);
  assert.equal(dataset.states.length, 51);
  assert.equal(dataset.counties.length, 3144);
  assert.equal(new Set(dataset.metros.map((metro) => metro.cbsa)).size, 387);
  assert.equal(new Set(dataset.states.map((state) => state.fips)).size, 51);
  assert.equal(new Set(dataset.counties.map((county) => county.countyFips)).size, 3144);
  assert.ok(dataset.states.some((state) => state.abbr === "DC"));
  assert.ok(dataset.metros.every((metro) => !metro.states.includes("PR")));
  assert.ok(dataset.counties.every((county) => county.stateFips !== "72"));
});

test("all metro records contain required current indicators and documented baseline coverage", () => {
  for (const metro of dataset.metros) {
    for (const field of ["population", "medianIncome", "medianRent", "medianHomeValue", "density", "housingUnits"]) {
      assert.equal(typeof metro[field], "number", `${metro.name}: ${field}`);
    }
  }
  assert.ok(dataset.metros.filter((metro) => metro.populationBaseline != null && metro.employedBaseline != null && metro.housingBaseline != null).length >= 350);
  assert.ok(dataset.counties.filter((county) => county.populationBaseline != null && county.employedBaseline != null && county.housingBaseline != null).length >= 3130);
});

test("Charlotte default model ranking remains stable", () => {
  const charlotte = dataset.metros.find((metro) => metro.name.startsWith("Charlotte-Concord-Gastonia"));
  assert.ok(charlotte);
  const scores = scoreFormats(charlotte, dataset.metros, DEFAULT_WEIGHTS);
  assert.deepEqual(scores.slice(0, 3).map(({ name, score }) => [name, score]), [
    ["Townhomes", 84.1],
    ["Mixed-use", 83.2],
    ["Apartments", 79.5],
  ]);
});

test("the bundled U.S. geometry produces a complete projected atlas", () => {
  const stateFeatures = feature(usAtlas, usAtlas.objects.states).features;
  const countyFeatures = [...feature(usAtlas, usAtlas.objects.counties).features, ...countyGeometrySupplement.features];
  const path = geoPath(geoAlbersUsa().scale(1280).translate([487.5, 305]));
  assert.equal(stateFeatures.length, 56);
  assert.ok(dataset.states.every((state) => {
    const mapState = stateFeatures.find((candidate) => String(candidate.id).padStart(2, "0") === state.fips);
    const rendered = mapState ? path(mapState) : null;
    return typeof rendered === "string" && rendered.length > 10;
  }));
  const mappedCountyIds = new Set(countyFeatures.map((county) => String(county.id).padStart(5, "0")));
  assert.ok(dataset.counties.every((county) => mappedCountyIds.has(county.countyFips)));
  assert.ok(countyGeometrySupplement.features.every((county) => {
    const [[x0, y0], [x1, y1]] = path.bounds(county);
    return x0 >= 0 && y0 >= 0 && x1 <= 975 && y1 <= 610 && typeof path(county) === "string";
  }));
});

test("county analysis uses county peers without changing the metro model", () => {
  const mecklenburg = dataset.counties.find((county) => county.countyFips === "37119");
  assert.ok(mecklenburg);
  const scores = scoreFormats(mecklenburg, dataset.counties, DEFAULT_WEIGHTS);
  assert.equal(scores.length, 5);
  assert.ok(scores.every((item) => item.score >= 0 && item.score <= 100));
  assert.ok(scores.every((item) => Object.keys(item.factors).length === 9));
});

test("sliders and all six scenarios produce recalculated scores", () => {
  const charlotte = dataset.metros.find((metro) => metro.name.startsWith("Charlotte-Concord-Gastonia"));
  const baseline = scoreFormats(charlotte, dataset.metros, DEFAULT_WEIGHTS).map((item) => item.score);
  const changed = scoreFormats(charlotte, dataset.metros, { ...DEFAULT_WEIGHTS, density: 30, household: 0 }).map((item) => item.score);
  assert.notDeepEqual(changed, baseline);
  assert.equal(SCENARIOS.length, 6);
  for (const scenario of SCENARIOS) {
    const scores = scoreFormats(charlotte, dataset.metros, DEFAULT_WEIGHTS, scenario.id);
    assert.equal(scores.length, 5);
    assert.ok(scores.every((item) => item.score >= 0 && item.score <= 100));
  }
});
