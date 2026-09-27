import test from "node:test";
import assert from "node:assert/strict";
import { safeSetStorage } from "../src/lib/browserStorage.ts";

test("safe storage write serializes and persists valid state", () => {
  const writes = new Map();
  const storage = { setItem: (key, value) => writes.set(key, value) };
  assert.equal(safeSetStorage(storage, "state", { pins: ["001"] }), true);
  assert.equal(writes.get("state"), '{"pins":["001"]}');
});

test("safe storage write absorbs quota/security errors instead of crashing UI effects", () => {
  const storage = { setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.equal(safeSetStorage(storage, "state", { ok: true }), false);
});

test("safe storage write safely rejects unavailable storage", () => {
  assert.equal(safeSetStorage(undefined, "state", { ok: true }), false);
});
