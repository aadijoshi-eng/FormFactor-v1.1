import assert from "node:assert/strict";
import test from "node:test";
import dataset from "../src/data/formfactor-data.json" with { type: "json" };
import { FACTOR_KEYS_FOR_TEST, FORMAT_KEYS_FOR_TEST } from "./fixtures/state-keys.mjs";
import { resolveAtlasLinkState, sanitizeAtlasStoredState, validWeights } from "../src/lib/atlasState.ts";

const layers = ["populationGrowth", "medianIncome", "medianRent", "medianHomeValue", "vacancyRate", "density"];

function params(query) { return new URLSearchParams(query); }

test("shared Atlas state rejects a county from a different requested state", () => {
  const resolved = resolveAtlasLinkState(params("ffState=37&ffCounty=06037&ffPins=37119,06037"), dataset.states, dataset.counties, layers, FORMAT_KEYS_FOR_TEST, FACTOR_KEYS_FOR_TEST);
  assert.equal(resolved.stateFips, "37");
  assert.equal(resolved.countyFips, undefined);
  assert.deepEqual(resolved.countyCompareFips, ["37119"]);
});

test("county-only links derive the correct state and constrain pins to it", () => {
  const resolved = resolveAtlasLinkState(params("ffCounty=06037&ffPins=06037,37119,06059"), dataset.states, dataset.counties, layers, FORMAT_KEYS_FOR_TEST, FACTOR_KEYS_FOR_TEST);
  assert.equal(resolved.stateFips, "06");
  assert.equal(resolved.countyFips, "06037");
  assert.deepEqual(resolved.countyCompareFips, ["06037", "06059"]);
});

test("shared weights require nine bounded integer values", () => {
  const good = Object.fromEntries(FACTOR_KEYS_FOR_TEST.map((key, index) => [key, index]));
  assert.equal(validWeights(good, FACTOR_KEYS_FOR_TEST), true);
  assert.equal(validWeights({ ...good, affordability: 31 }, FACTOR_KEYS_FOR_TEST), false);
  assert.equal(validWeights({ ...good, affordability: 3.5 }, FACTOR_KEYS_FOR_TEST), false);
  assert.equal(validWeights(Object.fromEntries(FACTOR_KEYS_FOR_TEST.map((key) => [key, 0])), FACTOR_KEYS_FOR_TEST), false);
});


test("an explicitly empty shared pin list overrides browser-local pins", () => {
  const resolved = resolveAtlasLinkState(params("ffState=37&ffCounty=37119&ffPins="), dataset.states, dataset.counties, layers, FORMAT_KEYS_FOR_TEST, FACTOR_KEYS_FOR_TEST);
  assert.equal(resolved.pinsSpecified, true);
  assert.deepEqual(resolved.countyCompareFips, []);

  const absent = resolveAtlasLinkState(params("ffState=37&ffCounty=37119"), dataset.states, dataset.counties, layers, FORMAT_KEYS_FOR_TEST, FACTOR_KEYS_FOR_TEST);
  assert.equal(absent.pinsSpecified, false);
});


test("pins-only shared links derive one state and reject cross-state pins", () => {
  const resolved = resolveAtlasLinkState(params("ffPins=37119,06037,37183"), dataset.states, dataset.counties, layers, FORMAT_KEYS_FOR_TEST, FACTOR_KEYS_FOR_TEST);
  assert.equal(resolved.stateFips, "37");
  assert.deepEqual(resolved.countyCompareFips, ["37119", "37183"]);
});


test("stored Atlas state safely rejects malformed localStorage payloads", () => {
  assert.deepEqual(sanitizeAtlasStoredState(null, layers, FORMAT_KEYS_FOR_TEST), { countyCompareFips: [] });
  assert.deepEqual(sanitizeAtlasStoredState([], layers, FORMAT_KEYS_FOR_TEST), { countyCompareFips: [] });
  assert.deepEqual(sanitizeAtlasStoredState("corrupt", layers, FORMAT_KEYS_FOR_TEST), { countyCompareFips: [] });
});

test("stored Atlas state sanitizes pins and enum-like preferences", () => {
  const resolved = sanitizeAtlasStoredState({
    layer: "medianRent",
    countyCompareFips: ["37119", 123, "37119", "37183", "37063", "37001"],
    countyRankDirection: "lowest",
    housingFitFormat: FORMAT_KEYS_FOR_TEST[0],
  }, layers, FORMAT_KEYS_FOR_TEST);
  assert.equal(resolved.layer, "medianRent");
  assert.deepEqual(resolved.countyCompareFips, ["37119", "37183", "37063"]);
  assert.equal(resolved.countyRankDirection, "lowest");
  assert.equal(resolved.housingFitFormat, FORMAT_KEYS_FOR_TEST[0]);

  const invalid = sanitizeAtlasStoredState({ layer: "bogus", countyRankDirection: "sideways", housingFitFormat: "bogus" }, layers, FORMAT_KEYS_FOR_TEST);
  assert.equal(invalid.layer, undefined);
  assert.equal(invalid.countyRankDirection, undefined);
  assert.equal(invalid.housingFitFormat, undefined);
});

test("Atlas persistence retains validated position and rejects a cross-state selected county", () => {
  const stored = sanitizeAtlasStoredState({ selectedFips: "37", selectedCountyFips: "37119", atlasMode: "counties", analysisId: "county:37119", countyCompareFips: ["37119"] }, layers, FORMAT_KEYS_FOR_TEST);
  assert.equal(stored.selectedFips, "37");
  assert.equal(stored.selectedCountyFips, "37119");
  assert.equal(stored.atlasMode, "counties");
  assert.equal(stored.analysisId, "county:37119");
  const invalid = sanitizeAtlasStoredState({ selectedFips: "37", selectedCountyFips: "06037", atlasMode: "bogus", analysisId: [] }, layers, FORMAT_KEYS_FOR_TEST);
  assert.equal(invalid.selectedCountyFips, undefined);
  assert.equal(invalid.atlasMode, undefined);
  assert.equal(invalid.analysisId, undefined);
});
