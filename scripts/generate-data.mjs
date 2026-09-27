import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = "https://www2.census.gov";
const ACS24 = `${ROOT}/programs-surveys/acs/summary_file/2024/table-based-SF`;
const ACS19 = `${ROOT}/programs-surveys/acs/summary_file/2019`;
const GAZ24 = `${ROOT}/geo/docs/maps-data/data/gazetteer/2024_Gazetteer`;
const BOUNDARIES24 = `${ROOT}/geo/tiger/GENZ2024/kml`;
const CACHE = ".data-cache";
mkdirSync(CACHE, { recursive: true });

const stateAbbr = { "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY" };
const regionFor = (abbr) => ["CT","ME","MA","NH","RI","VT","NJ","NY","PA"].includes(abbr) ? "Northeast" : ["IL","IN","MI","OH","WI","IA","KS","MN","MO","NE","ND","SD"].includes(abbr) ? "Midwest" : ["DE","DC","FL","GA","MD","NC","SC","VA","WV","AL","KY","MS","TN","AR","LA","OK","TX"].includes(abbr) ? "South" : "West";

async function fetchBuffer(url, attempts = 4) {
  const cachePath = join(CACHE, createHash("sha256").update(url).digest("hex"));
  if (existsSync(cachePath)) return readFileSync(cachePath);
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "FormFactor public-data prototype" }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = Buffer.from(await response.arrayBuffer());
      writeFileSync(cachePath, data);
      return data;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 900));
    }
  }
  throw new Error(`Unable to fetch ${url}: ${last}`);
}
const fetchText = async (url) => (await fetchBuffer(url)).toString("utf8");

function csvLine(line) {
  const output = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index++; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { output.push(value); value = ""; }
    else value += character;
  }
  output.push(value); return output;
}
function goodNumber(value) { if (value === "" || value == null) return null; const number = Number(value); return Number.isFinite(number) && number > -100000000 ? number : null; }
const ratio = (a, b, scale = 1) => a == null || b == null || b === 0 ? null : (a / b) * scale;
const growth = (current, prior) => current == null || prior == null || prior === 0 ? null : ((current / prior) - 1) * 100;
const sum = (...values) => values.every((value) => value != null) ? values.reduce((total, value) => total + value, 0) : null;
const round = (value, digits = 2) => value == null ? null : Number(value.toFixed(digits));

async function unzipText(url, fileName) {
  const folder = mkdtempSync(join(tmpdir(), "formfactor-"));
  try {
    const zip = join(folder, "source.zip"); writeFileSync(zip, await fetchBuffer(url));
    return execFileSync("unzip", ["-p", zip, fileName], { encoding: "utf8", maxBuffer: 250 * 1024 * 1024 });
  } finally { rmSync(folder, { recursive: true, force: true }); }
}

console.log("2024 geography index");
const geoText = await fetchText(`${ACS24}/documentation/Geos20245YR.txt`);
const geoLines = geoText.trim().split(/\r?\n/); const geoHeader = geoLines.shift().split("|");
const at = Object.fromEntries(geoHeader.map((name, index) => [name, index]));
const geos = { metros: [], states: [], counties: [] };
for (const line of geoLines) {
  const row = line.split("|"); const level = row[at.SUMLEVEL]; const name = row[at.NAME];
  if (level === "310" && name.endsWith("Metro Area")) {
    const codes = (name.match(/, ([A-Z-]+) Metro Area$/)?.[1] || "").split("-").filter(Boolean);
    if (!codes.includes("PR")) geos.metros.push({ geoId: row[at.GEO_ID], cbsa: row[at.CBSA], name, states: codes, primaryState: codes[0], region: regionFor(codes[0]) });
  }
  if (level === "040" && row[at.COMPONENT] === "00" && row[at.STATE] !== "72") {
    const fips = row[at.STATE]; const abbr = stateAbbr[fips];
    geos.states.push({ geoId: row[at.GEO_ID], fips, name, abbr, region: regionFor(abbr) });
  }
  if (level === "050" && row[at.COMPONENT] === "00" && row[at.STATE] !== "72") {
    const stateFips = row[at.STATE]; const county = row[at.COUNTY]; const abbr = stateAbbr[stateFips];
    geos.counties.push({ geoId: row[at.GEO_ID], countyFips: `${stateFips}${county}`, stateFips, stateAbbr: abbr, name, region: regionFor(abbr) });
  }
}
if (geos.metros.length !== 387 || geos.states.length !== 51 || geos.counties.length !== 3144) throw new Error(`Unexpected geography scope: ${geos.metros.length} metros / ${geos.states.length} states / ${geos.counties.length} counties`);

const wanted = new Set([...geos.metros, ...geos.states, ...geos.counties].map((geo) => geo.geoId));
const tableNames = ["b01003","b19013","b25064","b25077","b25002","b25010","b23025","b08301","b08013","b25001","b25034","b25003","b25024"];
const tables = {};
for (const table of tableNames) {
  console.log(`2024 ${table.toUpperCase()}`);
  const text = await fetchText(`${ACS24}/data/5YRData/acsdt5y2024-${table}.dat`);
  const lines = text.trim().split(/\r?\n/); const header = lines.shift().split("|"); const index = Object.fromEntries(header.map((name, position) => [name, position]));
  const records = new Map();
  for (const line of lines) {
    const row = line.split("|"); if (!wanted.has(row[index.GEO_ID])) continue;
    const record = {};
    for (const [field, position] of Object.entries(index)) if (field.endsWith("_E001") || /_E0(0[2-9]|1[0-9]|2[0-9])$/.test(field)) record[field] = goodNumber(row[position]);
    records.set(row[index.GEO_ID], record);
  }
  tables[table.toUpperCase()] = records;
}

console.log("2015–2019 metro baseline");
const geo19 = await fetchText(`${ACS19}/data/5_year_seq_by_state/UnitedStates/All_Geographies_Not_Tracts_Block_Groups/g20195us.csv`);
const metroLog = new Map();
for (const line of geo19.trim().split(/\r?\n/)) { const row = csvLine(line); if (row[2] === "310" && row[49]?.endsWith("Metro Area")) metroLog.set(row[22], row[4]); }
const baselineByLog = new Map([...metroLog].map(([cbsa, log]) => [log, { cbsa }]));
const sequences = [
  { seq: "0002", file: "e20195us0002000.txt", zip: "20195us0002000.zip", field: "population", index: 129 },
  { seq: "0078", file: "e20195us0078000.txt", zip: "20195us0078000.zip", field: "employedResidents", index: 40 },
  { seq: "0111", file: "e20195us0111000.txt", zip: "20195us0111000.zip", field: "housingUnits", index: 6 },
];
const us19 = `${ACS19}/data/5_year_seq_by_state/UnitedStates/All_Geographies_Not_Tracts_Block_Groups`;
for (const sequence of sequences) {
  const text = await unzipText(`${us19}/${sequence.zip}`, sequence.file);
  for (const line of text.trim().split(/\r?\n/)) { const row = line.split(","); const record = baselineByLog.get(row[5]); if (record) record[sequence.field] = goodNumber(row[sequence.index]); }
}

console.log("2015–2019 state and county baselines");
const stateBaselines = new Map(); const countyBaselines = new Map();
for (let start = 0; start < geos.states.length; start += 5) {
  await Promise.all(geos.states.slice(start, start + 5).map(async (state) => {
    const folder = state.abbr === "DC" ? "DistrictOfColumbia" : state.name.replace(/[^A-Za-z]/g, "");
    const code = state.abbr.toLowerCase(); const base = `${ACS19}/data/5_year_seq_by_state/${folder}/All_Geographies_Not_Tracts_Block_Groups`;
    const geographyText = await fetchText(`${base}/g20195${code}.csv`);
    const targets = new Map();
    for (const line of geographyText.trim().split(/\r?\n/)) {
      const row = csvLine(line); const level = row[2]; const component = row[3]; const logrec = row[4];
      if (component !== "00") continue;
      if (level === "040") targets.set(logrec, { kind: "state", id: state.fips });
      if (level === "050") targets.set(logrec, { kind: "county", id: `${row[9]}${row[10]}` });
    }
    const stateRecord = {}; stateBaselines.set(state.fips, stateRecord);
    for (const target of targets.values()) if (target.kind === "county") countyBaselines.set(target.id, {});
    await Promise.all(sequences.map(async (sequence) => {
      const text = await unzipText(`${base}/20195${code}${sequence.seq}000.zip`, `e20195${code}${sequence.seq}000.txt`);
      for (const line of text.trim().split(/\r?\n/)) {
        const row = line.split(","); const target = targets.get(row[5]); if (!target) continue;
        const record = target.kind === "state" ? stateRecord : countyBaselines.get(target.id);
        record[sequence.field] = goodNumber(row[sequence.index]);
      }
    }));
  }));
  console.log(`  ${Math.min(start + 5, geos.states.length)} / ${geos.states.length}`);
}

console.log("2024 Gazetteer areas");
const cbsaGaz = await unzipText(`${GAZ24}/2024_Gaz_cbsa_national.zip`, "2024_Gaz_cbsa_national.txt");
const stateGaz = await unzipText(`${GAZ24}/2024_Gaz_state_national.zip`, "2024_Gaz_state_national.txt");
const countyGaz = await unzipText(`${GAZ24}/2024_Gaz_counties_national.zip`, "2024_Gaz_counties_national.txt");
function areaMap(text, idField) {
  const lines = text.trimEnd().split(/\r?\n/); const header = lines.shift().split("\t").map((value) => value.trim()); const index = Object.fromEntries(header.map((name, position) => [name, position])); const output = new Map();
  // Preserve empty leading fields (for example a blank CSAFP). Trimming the
  // whole row before splitting would shift every later Gazetteer column.
  for (const line of lines) { const row = line.replace(/\r$/, "").split("\t").map((value) => value.trim()); output.set(row[index[idField]], { landSqMi: goodNumber(row[index.ALAND_SQMI]), latitude: goodNumber(row[index.INTPTLAT]), longitude: goodNumber(row[index.INTPTLONG]) }); }
  return output;
}
const cbsaArea = areaMap(cbsaGaz, "GEOID"); const stateArea = areaMap(stateGaz, "USPS"); const countyArea = areaMap(countyGaz, "GEOID");

function buildRecord(geo, kind) {
  const get = (table, field) => tables[table].get(geo.geoId)?.[field] ?? null;
  const population = get("B01003", "B01003_E001"); const income = get("B19013", "B19013_E001"); const rent = get("B25064", "B25064_E001"); const home = get("B25077", "B25077_E001");
  const vacancyTotal = get("B25002", "B25002_E001"); const vacant = get("B25002", "B25002_E003"); const household = get("B25010", "B25010_E001"); const employed = get("B23025", "B23025_E004");
  const workers = get("B08301", "B08301_E001"); const drive = get("B08301", "B08301_E003"); const transit = get("B08301", "B08301_E010"); const homeWorkers = get("B08301", "B08301_E021"); const travel = get("B08013", "B08013_E001");
  const housing = get("B25001", "B25001_E001"); const recent = get("B25034", "B25034_E002"); const builtTotal = get("B25034", "B25034_E001"); const tenure = get("B25003", "B25003_E001"); const renters = get("B25003", "B25003_E003");
  const structures = get("B25024", "B25024_E001"); const detached = get("B25024", "B25024_E002"); const attached = get("B25024", "B25024_E003"); const multifamily = sum(...[4,5,6,7,8,9].map((number) => get("B25024", `B25024_E${String(number).padStart(3, "0")}`)));
  const baseline = kind === "metro" ? baselineByLog.get(metroLog.get(geo.cbsa)) : kind === "county" ? countyBaselines.get(geo.countyFips) : stateBaselines.get(geo.fips);
  const area = kind === "metro" ? cbsaArea.get(geo.cbsa) : kind === "county" ? countyArea.get(geo.countyFips) : stateArea.get(geo.abbr);
  return { ...geo, population, populationBaseline: baseline?.population ?? null, populationGrowth: round(growth(population, baseline?.population)), medianIncome: income, medianRent: rent, medianHomeValue: home, rentIncomeShare: round(ratio(rent == null ? null : rent * 12, income, 100)), homeValueIncomeRatio: round(ratio(home, income)), vacancyRate: round(ratio(vacant, vacancyTotal, 100)), avgHouseholdSize: household, employedResidents: employed, employedBaseline: baseline?.employedResidents ?? null, employmentGrowth: round(growth(employed, baseline?.employedResidents)), housingUnits: housing, housingBaseline: baseline?.housingUnits ?? null, housingGrowth: round(growth(housing, baseline?.housingUnits)), density: round(ratio(population, area?.landSqMi)), transitShare: round(ratio(transit, workers, 100)), driveAloneShare: round(ratio(drive, workers, 100)), workFromHomeShare: round(ratio(homeWorkers, workers, 100)), meanCommuteMinutes: round(ratio(travel, workers == null || homeWorkers == null ? null : workers - homeWorkers)), renterShare: round(ratio(renters, tenure, 100)), recentConstructionShare: round(ratio(recent, builtTotal, 100)), detachedShare: round(ratio(detached, structures, 100)), attachedShare: round(ratio(attached, structures, 100)), multifamilyShare: round(ratio(multifamily, structures, 100)), landSqMi: round(area?.landSqMi, 1), latitude: area?.latitude ?? null, longitude: area?.longitude ?? null, dataVintage: "2020–2024 ACS 5-year", comparisonVintage: "2015–2019 ACS 5-year" };
}

const metros = geos.metros.map((geo) => buildRecord(geo, "metro")).filter((metro) => metro.population != null).sort((a, b) => a.name.localeCompare(b.name));
const states = geos.states.map((geo) => buildRecord(geo, "state")).filter((state) => state.population != null).sort((a, b) => a.name.localeCompare(b.name));
const counties = geos.counties.map((geo) => buildRecord(geo, "county")).filter((county) => county.population != null).sort((a, b) => a.name.localeCompare(b.name));
if (metros.length !== 387 || states.length !== 51 || counties.length !== 3144) throw new Error(`Output scope failed: ${metros.length} / ${states.length} / ${counties.length}`);
const output = { generatedAt: new Date().toISOString(), datasetLabel: "U.S. prototype atlas · 2024 ACS", metroCount: metros.length, stateCount: states.length, countyCount: counties.length, indicatorCount: 18, methodology: "Reported ACS estimates plus transparent calculations. Growth uses non-overlapping 2015–2019 and 2020–2024 five-year vintages joined by identifier; boundaries are not harmonized.", metros, states, counties };
mkdirSync("src/data", { recursive: true }); writeFileSync("src/data/formfactor-data.json", `${JSON.stringify(output)}\n`);

// us-atlas provides compact nationwide geometry, but its county vintage predates
// two Alaska census areas and Connecticut's nine planning regions. Retain the
// compact base and add only those newer official Census cartographic features.
console.log("2024 county geometry supplement");
const supplementIds = new Set(["02063","02066","09110","09120","09130","09140","09150","09160","09170","09180","09190"]);
const countyKml = await unzipText(`${BOUNDARIES24}/cb_2024_us_county_20m.zip`, "cb_2024_us_county_20m.kml");
function parseCoordinates(text) {
  return text.trim().split(/\s+/).map((point) => point.split(",").slice(0, 2).map(Number)).filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
}
const supplementFeatures = [];
for (const [placemark] of countyKml.matchAll(/<Placemark[\s\S]*?<\/Placemark>/g)) {
  const id = placemark.match(/<SimpleData name="GEOID">(\d{5})<\/SimpleData>/)?.[1];
  if (!id || !supplementIds.has(id)) continue;
  const polygons = [];
  for (const [polygon] of placemark.matchAll(/<Polygon>[\s\S]*?<\/Polygon>/g)) {
    const outer = polygon.match(/<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/outerBoundaryIs>/)?.[1];
    if (!outer) continue;
    // Census KML and d3-geo use opposite spherical winding conventions.
    const rings = [parseCoordinates(outer).reverse()];
    for (const inner of polygon.matchAll(/<innerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/innerBoundaryIs>/g)) rings.push(parseCoordinates(inner[1]).reverse());
    polygons.push(rings);
  }
  if (polygons.length) supplementFeatures.push({ type: "Feature", id, properties: {}, geometry: polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons } });
}
if (supplementFeatures.length !== supplementIds.size) throw new Error(`County geometry supplement failed: ${supplementFeatures.length} / ${supplementIds.size}`);
writeFileSync("src/data/county-geometry-supplement.json", `${JSON.stringify({ type: "FeatureCollection", features: supplementFeatures })}\n`);
console.log(`Wrote ${metros.length} metros, ${states.length} state/DC records, and ${counties.length} counties.`);
