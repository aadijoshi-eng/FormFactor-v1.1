import assert from "node:assert/strict";
import test from "node:test";
import dataset from "../src/data/formfactor-data.json" with { type: "json" };
import { FACTOR_KEYS_FOR_TEST, FORMAT_KEYS_FOR_TEST } from "./fixtures/state-keys.mjs";
import { atlasShareCountyFips, resolveAtlasLinkState, writeAtlasShareParams } from "../src/lib/atlasState.ts";

const layers = ["populationGrowth", "medianIncome", "medianRent", "medianHomeValue", "vacancyRate", "density"];

function resolve(query) {
  return resolveAtlasLinkState(new URLSearchParams(query), dataset.states, dataset.counties, layers, FORMAT_KEYS_FOR_TEST, FACTOR_KEYS_FOR_TEST);
}

test("full Atlas share payload round-trips state, county, pins, direction, format, and nine weights", () => {
  const weights = FACTOR_KEYS_FOR_TEST.map((_, index) => (index % 5) + 1);
  const fit = FORMAT_KEYS_FOR_TEST[2];
  const result = resolve([
    "ffState=37",
    "ffCounty=37119",
    "ffLayer=medianRent",
    "ffRank=lowest",
    `ffFit=${fit}`,
    `ffW=${weights.join(",")}`,
    "ffPins=37119,37183,37063",
  ].join("&"));

  assert.equal(result.stateFips, "37");
  assert.equal(result.countyFips, "37119");
  assert.equal(result.layer, "medianRent");
  assert.equal(result.countyRankDirection, "lowest");
  assert.equal(result.housingFitFormat, fit);
  assert.equal(result.pinsSpecified, true);
  assert.deepEqual(result.countyCompareFips, ["37119", "37183", "37063"]);
  assert.deepEqual(result.weights, Object.fromEntries(FACTOR_KEYS_FOR_TEST.map((key, index) => [key, weights[index]])));
});

test("explicit zero-pin share payload remains distinguishable from an absent pin parameter", () => {
  const emptyPins = resolve("ffState=37&ffCounty=37119&ffPins=&ffRank=highest");
  const absentPins = resolve("ffState=37&ffCounty=37119&ffRank=highest");

  assert.equal(emptyPins.pinsSpecified, true);
  assert.deepEqual(emptyPins.countyCompareFips, []);
  assert.equal(absentPins.pinsSpecified, false);
});

test("full share payload rejects cross-state pins without disturbing valid same-state state", () => {
  const result = resolve("ffState=37&ffCounty=37119&ffPins=06037,37119,37183&ffLayer=density&ffRank=highest");
  assert.equal(result.stateFips, "37");
  assert.equal(result.countyFips, "37119");
  assert.deepEqual(result.countyCompareFips, ["37119", "37183"]);
  assert.equal(result.layer, "density");
  assert.equal(result.countyRankDirection, "highest");
});


test("Atlas share writer serializes the complete contract and round-trips through the resolver", () => {
  const weights = Object.fromEntries(FACTOR_KEYS_FOR_TEST.map((key, index) => [key, (index % 4) + 1]));
  const params = writeAtlasShareParams(new URLSearchParams("keep=1&ffCounty=06037"), {
    stateFips: "37",
    countyFips: "37119",
    layer: "medianHomeValue",
    countyCompareFips: ["37119", "37183"],
    countyRankDirection: "lowest",
    housingFitFormat: FORMAT_KEYS_FOR_TEST[3],
    weights,
  }, FACTOR_KEYS_FOR_TEST);

  assert.equal(params.get("keep"), "1");
  for (const key of ["ffState", "ffCounty", "ffLayer", "ffRank", "ffFit", "ffW", "ffPins"]) assert.equal(params.has(key), true, key);
  const resolved = resolveAtlasLinkState(params, dataset.states, dataset.counties, layers, FORMAT_KEYS_FOR_TEST, FACTOR_KEYS_FOR_TEST);
  assert.equal(resolved.stateFips, "37");
  assert.equal(resolved.countyFips, "37119");
  assert.equal(resolved.layer, "medianHomeValue");
  assert.equal(resolved.countyRankDirection, "lowest");
  assert.equal(resolved.housingFitFormat, FORMAT_KEYS_FOR_TEST[3]);
  assert.deepEqual(resolved.countyCompareFips, ["37119", "37183"]);
  assert.deepEqual(resolved.weights, weights);
});

test("Atlas share writer preserves explicit zero-pin state and removes stale county when none is selected", () => {
  const weights = Object.fromEntries(FACTOR_KEYS_FOR_TEST.map((key) => [key, 1]));
  const params = writeAtlasShareParams(new URLSearchParams("ffCounty=06037"), {
    stateFips: "37",
    layer: "density",
    countyCompareFips: [],
    countyRankDirection: "highest",
    housingFitFormat: FORMAT_KEYS_FOR_TEST[0],
    weights,
  }, FACTOR_KEYS_FOR_TEST);

  assert.equal(params.has("ffCounty"), false);
  assert.equal(params.has("ffPins"), true);
  assert.equal(params.get("ffPins"), "");
  const resolved = resolveAtlasLinkState(params, dataset.states, dataset.counties, layers, FORMAT_KEYS_FOR_TEST, FACTOR_KEYS_FOR_TEST);
  assert.equal(resolved.pinsSpecified, true);
  assert.deepEqual(resolved.countyCompareFips, []);
});


test("state-mode Atlas shares omit the incidental selected county while county mode preserves it", () => {
  assert.equal(atlasShareCountyFips("states", "37119"), undefined);
  assert.equal(atlasShareCountyFips("counties", "37119"), "37119");
  assert.equal(atlasShareCountyFips("counties", undefined), undefined);
});

test("state-only shared Atlas links preserve the requested state without inventing a county", () => {
  const weights = Object.fromEntries(FACTOR_KEYS_FOR_TEST.map((key) => [key, 1]));
  const params = writeAtlasShareParams(new URLSearchParams(), {
    stateFips: "37",
    countyFips: atlasShareCountyFips("states", "37119"),
    layer: "medianIncome",
    countyCompareFips: [],
    countyRankDirection: "highest",
    housingFitFormat: FORMAT_KEYS_FOR_TEST[0],
    weights,
  }, FACTOR_KEYS_FOR_TEST);
  assert.equal(params.get("ffState"), "37");
  assert.equal(params.has("ffCounty"), false);
  const resolved = resolveAtlasLinkState(params, dataset.states, dataset.counties, layers, FORMAT_KEYS_FOR_TEST, FACTOR_KEYS_FOR_TEST);
  assert.equal(resolved.stateFips, "37");
  assert.equal(resolved.countyFips, undefined);
});
