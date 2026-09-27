import assert from "node:assert/strict";
import test from "node:test";
import { FACTOR_KEYS_FOR_TEST } from "./fixtures/state-keys.mjs";
import { sanitizeStoredState } from "../src/lib/storedState.ts";

const weights = Object.fromEntries(FACTOR_KEYS_FOR_TEST.map((key) => [key, 1]));

function validSaved(overrides = {}) {
  return {
    id: "county-37119-1",
    geographyKind: "county",
    geographyId: "37119",
    geographyName: "Mecklenburg County, NC",
    savedAt: "2026-09-10T00:00:00.000Z",
    winner: "Mixed-use",
    score: 82.5,
    weights,
    ...overrides,
  };
}

test("primary stored state rejects non-object and non-array saved payloads", () => {
  assert.deepEqual(sanitizeStoredState(null, FACTOR_KEYS_FOR_TEST), { saved: [] });
  assert.deepEqual(sanitizeStoredState([], FACTOR_KEYS_FOR_TEST), { saved: [] });
  assert.deepEqual(sanitizeStoredState({ saved: { broken: true } }, FACTOR_KEYS_FOR_TEST).saved, []);
});

test("primary stored state filters malformed comparisons that could crash Compare", () => {
  const resolved = sanitizeStoredState({
    saved: [
      validSaved(),
      validSaved({ id: "bad-score", score: "82.5" }),
      validSaved({ id: "bad-weights", weights: Object.fromEntries(FACTOR_KEYS_FOR_TEST.map((key) => [key, 0])) }),
      null,
    ],
  }, FACTOR_KEYS_FOR_TEST);
  assert.equal(resolved.saved.length, 1);
  assert.equal(resolved.saved[0].id, "county-37119-1");
  assert.equal(resolved.saved[0].score, 82.5);
});

test("primary stored state sanitizes enum and string fields while preserving valid comparisons", () => {
  const resolved = sanitizeStoredState({
    selectedCbsa: "16740",
    selectedCountyFips: "37119",
    geographyKind: "county",
    weights,
    saved: [validSaved({ geographyKind: "bogus", metroName: 7 })],
  }, FACTOR_KEYS_FOR_TEST);
  assert.equal(resolved.selectedCbsa, "16740");
  assert.equal(resolved.selectedCountyFips, "37119");
  assert.equal(resolved.geographyKind, "county");
  assert.deepEqual(resolved.weights, weights);
  assert.equal(resolved.saved[0].geographyKind, undefined);
  assert.equal(resolved.saved[0].metroName, undefined);
});
