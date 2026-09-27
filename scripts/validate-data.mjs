import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync("src/data/formfactor-data.json", "utf8"));
assert.equal(data.metros.length, 387);
assert.equal(data.states.length, 51);
assert.equal(data.counties.length, 3144);
assert.equal(new Set(data.metros.map((item) => item.cbsa)).size, 387);
assert.equal(new Set(data.states.map((item) => item.fips)).size, 51);
assert.equal(new Set(data.counties.map((item) => item.countyFips)).size, 3144);
assert.ok(!data.metros.some((item) => item.states.includes("PR")));
assert.ok(!data.counties.some((item) => item.stateFips === "72"));
assert.ok(data.states.some((item) => item.abbr === "DC"));
assert.ok(data.metros.some((item) => item.cbsa === "16740"));
assert.ok(data.counties.some((item) => item.countyFips === "37119"));
const currentFields = ["population","medianIncome","medianRent","medianHomeValue","vacancyRate","avgHouseholdSize","employedResidents","housingUnits","density","transitShare","driveAloneShare","workFromHomeShare","meanCommuteMinutes","renterShare","detachedShare","attachedShare","multifamilyShare"];
for (const item of [...data.metros, ...data.states]) for (const field of currentFields) assert.ok(Number.isFinite(item[field]), `${item.name}: ${field}`);
for (const field of currentFields) assert.ok(data.counties.filter((item) => Number.isFinite(item[field])).length >= 3130, `County coverage for ${field}`);
assert.ok(data.metros.filter((item) => Number.isFinite(item.populationGrowth) && Number.isFinite(item.employmentGrowth) && Number.isFinite(item.housingGrowth)).length >= 350);
assert.ok(data.states.every((item) => Number.isFinite(item.populationGrowth)));
assert.ok(data.counties.filter((item) => Number.isFinite(item.populationGrowth) && Number.isFinite(item.employmentGrowth) && Number.isFinite(item.housingGrowth)).length >= 3130);
console.log(`Validated ${data.metros.length} metros, ${data.states.length} state/DC records, and ${data.counties.length} counties.`);

// Validate calculations that can be reproduced from retained values. This does
// not establish that the upstream survey estimates were transcribed correctly.
const shareFields = ["vacancyRate", "transitShare", "driveAloneShare", "workFromHomeShare", "renterShare", "recentConstructionShare", "detachedShare", "attachedShare", "multifamilyShare"];
const statesByFips = new Map(data.states.map((state) => [state.fips, state]));
for (const county of data.counties) {
  assert.equal(county.countyFips.slice(0, 2), county.stateFips);
  assert.equal(statesByFips.get(county.stateFips)?.abbr, county.stateAbbr);
}
for (const row of [...data.metros, ...data.states, ...data.counties]) {
  assert.equal(row.dataVintage, "2020–2024 ACS 5-year");
  assert.equal(row.comparisonVintage, "2015–2019 ACS 5-year");
  for (const key of shareFields) assert.ok(row[key] == null || (Number.isFinite(row[key]) && row[key] >= 0 && row[key] <= 100), `${row.name}: ${key} range`);
  for (const [key, current, baseline] of [["populationGrowth", "population", "populationBaseline"], ["employmentGrowth", "employedResidents", "employedBaseline"], ["housingGrowth", "housingUnits", "housingBaseline"]]) {
    const expected = row[current] == null || !row[baseline] ? null : Number(((row[current] / row[baseline] - 1) * 100).toFixed(2));
    // JSON serialization normalizes negative zero to zero.
    assert.equal(row[key], expected === 0 ? 0 : expected, `${row.name}: ${key} calculation`);
  }
  const rentRatio = row.medianRent == null || !row.medianIncome ? null : Number((row.medianRent * 12 / row.medianIncome * 100).toFixed(2));
  const homeRatio = row.medianHomeValue == null || !row.medianIncome ? null : Number((row.medianHomeValue / row.medianIncome).toFixed(2));
  assert.equal(row.rentIncomeShare, rentRatio, `${row.name}: rent ratio`);
  assert.equal(row.homeValueIncomeRatio, homeRatio, `${row.name}: home ratio`);
}
console.log("Retained growth/affordability calculations, percentage ranges, vintages, and county-state joins are consistent.");
