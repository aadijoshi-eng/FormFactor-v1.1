import assert from "node:assert/strict";
import test from "node:test";
import { serializeCsv } from "../src/lib/csv.ts";

test("CSV output handles numbers, empty cells, quotes, and formula-like text", () => {
  const csv = serializeCsv([
    ["county", "value", "filter"],
    ['Example, "County"', -2.5, '=HYPERLINK("example")'],
    ["Missing", null, ""],
  ]);
  assert.equal(csv, '\uFEFF"county","value","filter"\r\n"Example, ""County""","-2.5","\'=HYPERLINK(""example"")"\r\n"Missing","",""\r\n');
});
