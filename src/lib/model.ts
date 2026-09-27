export type ViewKey = "home" | "atlas" | "explorer" | "profile" | "compare" | "scenarios" | "methodology" | "sources";
export type FactorKey = "affordability" | "density" | "household" | "jobs" | "transportation" | "shortage" | "land" | "pressure" | "existingMix";
export type FormatKey = "apartments" | "townhomes" | "detached" | "mixedUse" | "masterPlanned";
export type Weights = Record<FactorKey, number>;

export interface GeographyRecord {
  geoId: string;
  name: string;
  region: string;
  population: number | null;
  populationBaseline: number | null;
  populationGrowth: number | null;
  medianIncome: number | null;
  medianRent: number | null;
  medianHomeValue: number | null;
  rentIncomeShare: number | null;
  homeValueIncomeRatio: number | null;
  vacancyRate: number | null;
  avgHouseholdSize: number | null;
  employedResidents: number | null;
  employedBaseline: number | null;
  employmentGrowth: number | null;
  housingUnits: number | null;
  housingBaseline: number | null;
  housingGrowth: number | null;
  density: number | null;
  transitShare: number | null;
  driveAloneShare: number | null;
  workFromHomeShare: number | null;
  meanCommuteMinutes: number | null;
  renterShare: number | null;
  recentConstructionShare: number | null;
  detachedShare: number | null;
  attachedShare: number | null;
  multifamilyShare: number | null;
  landSqMi: number | null;
  latitude: number | null;
  longitude: number | null;
  dataVintage: string;
  comparisonVintage: string;
}

export interface Metro extends GeographyRecord { cbsa: string; states: string[]; primaryState: string; }
export interface County extends GeographyRecord { countyFips: string; stateFips: string; stateAbbr: string; }
export interface StateRecord extends GeographyRecord { fips: string; abbr: string; }
export type AnalysisGeography = Metro | County;
export type GeographyKind = "metro" | "county";
export interface Dataset { generatedAt: string; datasetLabel: string; metroCount: number; stateCount: number; countyCount: number; indicatorCount: number; methodology: string; metros: Metro[]; states: StateRecord[]; counties: County[]; }

export const DEFAULT_WEIGHTS: Weights = {
  affordability: 30, density: 13, household: 9, jobs: 12, transportation: 11,
  shortage: 14, land: 9, pressure: 8, existingMix: 6,
};

export function updateWeightPreservingPositiveTotal(current: Weights, factor: FactorKey, nextValue: number): Weights {
  const next = { ...current, [factor]: nextValue };
  return Object.values(next).some((value) => value > 0) ? next : { ...next, [factor]: 1 };
}

export const FACTOR_LABELS: Record<FactorKey, string> = {
  affordability: "Affordability", density: "Density", household: "Household size",
  jobs: "Job growth", transportation: "Transportation", shortage: "Shortage",
  land: "Land", pressure: "Pressure", existingMix: "Existing mix",
};

export const FORMAT_INFO: Record<FormatKey, {
  name: string; short: string; color: string; density: string; cost: string;
  maintenance: string; privacy: string; households: string; transit: string;
  amenities: string; advantage: string; limitation: string; bestFit: string; description: string;
}> = {
  apartments: { name: "Apartments", short: "Apartments", color: "#277c8f", density: "20–100+ homes / acre", cost: "Medium–high per building", maintenance: "Shared / managed", privacy: "Low–medium", households: "Strong for small households", transit: "High", amenities: "Shared fitness, lounges, courtyards", advantage: "Uses scarce land efficiently and can place more homes near jobs and transit.", limitation: "Less privacy, shared systems, and often limited space for larger households.", bestFit: "Dense, high-cost, transit-served markets with small households or housing pressure.", description: "Stacked homes with shared circulation and building systems." },
  townhomes: { name: "Townhomes", short: "Townhomes", color: "#3d927b", density: "8–25 homes / acre", cost: "Medium", maintenance: "Low–medium", privacy: "Medium", households: "Strong across household sizes", transit: "Medium–high", amenities: "Private entries, small yards, shared greens", advantage: "Adds density while retaining private entrances and family-sized layouts.", limitation: "Party walls, stairs, and limited private outdoor space can constrain some households.", bestFit: "Growing metros seeking a bridge between detached housing and apartments.", description: "Attached homes with individual entrances that bridge detached housing and apartments." },
  detached: { name: "Detached single-family", short: "Detached", color: "#c27b36", density: "1–8 homes / acre", cost: "Medium per home", maintenance: "High / household", privacy: "High", households: "High for larger households", transit: "Low–medium", amenities: "Private yards, garages, flexible rooms", advantage: "Offers privacy, space, and flexible layouts for larger households.", limitation: "Consumes more land and often raises infrastructure and transportation requirements.", bestFit: "Lower-density markets with available land and strong demand for larger homes.", description: "Individual homes on separate lots with the greatest private space." },
  mixedUse: { name: "Mixed-use", short: "Mixed-use", color: "#506e9e", density: "15–80+ homes / acre", cost: "High / complex", maintenance: "Shared / managed", privacy: "Low–medium", households: "Strong for varied small–medium households", transit: "Very high", amenities: "Retail, services, public realm, transit access", advantage: "Places housing, services, and daily destinations close together.", limitation: "Complex financing, phasing, parking, and operating coordination.", bestFit: "Job centers, corridors, and walkable districts with strong access demand.", description: "Housing integrated with shops, services, workplaces, or civic uses." },
  masterPlanned: { name: "Master-planned", short: "Master-planned", color: "#7692a6", density: "2–18 homes / acre", cost: "High upfront infrastructure", maintenance: "Mixed / association", privacy: "Medium–high", households: "High across household types", transit: "Low–medium", amenities: "Parks, trails, schools, community facilities", advantage: "Coordinates housing types, infrastructure, and amenities at district scale.", limitation: "Requires large sites, long timelines, and careful phasing.", bestFit: "Fast-growing edges where large sites and long-term infrastructure planning are feasible.", description: "Large coordinated districts combining homes, amenities, and infrastructure." },
};

export const FORMAT_PROFILES: Record<FormatKey, Omit<Record<FactorKey, number>, "existingMix">> = {
  apartments: { affordability: 92, density: 92, household: 34, jobs: 80, transportation: 92, shortage: 92, land: 95, pressure: 80 },
  townhomes: { affordability: 78, density: 58, household: 72, jobs: 74, transportation: 58, shortage: 82, land: 68, pressure: 80 },
  detached: { affordability: 45, density: 18, household: 94, jobs: 55, transportation: 22, shortage: 38, land: 18, pressure: 50 },
  mixedUse: { affordability: 82, density: 96, household: 44, jobs: 92, transportation: 98, shortage: 88, land: 98, pressure: 90 },
  masterPlanned: { affordability: 58, density: 34, household: 88, jobs: 76, transportation: 38, shortage: 68, land: 24, pressure: 90 },
};

// Fixed model assumptions, not coefficients estimated from housing outcomes.
// These adjustments are disclosed alongside the formula in Methodology.
export const FORMAT_ADJUSTMENTS: Record<FormatKey, number> = {
  apartments: -5.2, townhomes: -5.7, detached: -8.9, mixedUse: -3.5, masterPlanned: -5,
};

export const SCENARIOS = [
  { id: "suburban", eyebrow: "Balanced growth", name: "Growing suburban metro", description: "Strong household and employment growth, moderate density, and continued outward expansion.", signal: { density: 46, household: 75, jobs: 80, land: 42, pressure: 78 }, weights: { household: 15, jobs: 16, pressure: 14 } },
  { id: "urban", eyebrow: "Land efficiency", name: "Dense urban core", description: "Very high density, constrained land, strong multimodal access, and smaller households.", signal: { density: 96, household: 32, transportation: 95, land: 98, shortage: 88 }, weights: { density: 20, transportation: 18, land: 16 } },
  { id: "college", eyebrow: "Flexible households", name: "College-centered community", description: "High turnover, small households, concentrated trip patterns, and recurring rental demand.", signal: { household: 28, transportation: 74, affordability: 86 }, weights: { affordability: 28, household: 17, transportation: 15 } },
  { id: "family", eyebrow: "Household space", name: "Family-oriented suburb", description: "Larger households, moderate land availability, and demand for schools, parks, and private space.", signal: { household: 94, density: 30, land: 24, transportation: 28 }, weights: { household: 22, land: 15, affordability: 24 } },
  { id: "constrained", eyebrow: "Maximum land efficiency", name: "High-cost, land-constrained market", description: "Severe cost pressure, limited developable land, and a need to add homes without outward expansion.", signal: { affordability: 98, density: 92, shortage: 94, land: 99, pressure: 92 }, weights: { affordability: 32, shortage: 18, land: 18 } },
  { id: "sunbelt", eyebrow: "Growth absorption", name: "Fast-growing Sun Belt metro", description: "Rapid population and job growth, recent construction, and a mix of suburban expansion and emerging centers.", signal: { jobs: 92, pressure: 96, shortage: 76, household: 70, density: 48 }, weights: { jobs: 18, pressure: 18, shortage: 15 } },
] as const;

// Bundled peer arrays are immutable. Reuse their sorted values while the user
// adjusts controls instead of sorting thousands of records for every county.
const percentileCache = new WeakMap<GeographyRecord[], Map<string, number[]>>();

function percentile(peers: GeographyRecord[], key: keyof GeographyRecord, value: number | null, log = false) {
  if (value == null) return 50;
  let cached = percentileCache.get(peers);
  if (!cached) { cached = new Map(); percentileCache.set(peers, cached); }
  const cacheKey = `${key}:${log}`;
  let clean = cached.get(cacheKey);
  if (!clean) {
    clean = peers.map((peer) => peer[key]).filter((candidate): candidate is number => typeof candidate === "number" && Number.isFinite(candidate)).map((candidate) => log ? Math.log1p(Math.max(candidate, 0)) : candidate).sort((a, b) => a - b);
    cached.set(cacheKey, clean);
  }
  const target = log ? Math.log1p(Math.max(value, 0)) : value;
  let lo = 0; let hi = clean.length;
  while (lo < hi) {
    const middle = (lo + hi) >>> 1;
    if (clean[middle] <= target) lo = middle + 1;
    else hi = middle;
  }
  return clean.length ? (lo / clean.length) * 100 : 50;
}

export function communitySignals(geography: GeographyRecord, peers: GeographyRecord[], scenarioId?: string): Record<FactorKey, number> {
  const rent = percentile(peers, "rentIncomeShare", geography.rentIncomeShare);
  const value = percentile(peers, "homeValueIncomeRatio", geography.homeValueIncomeRatio);
  const pop = percentile(peers, "populationGrowth", geography.populationGrowth);
  const jobs = percentile(peers, "employmentGrowth", geography.employmentGrowth);
  const housing = percentile(peers, "housingGrowth", geography.housingGrowth);
  const vacancy = percentile(peers, "vacancyRate", geography.vacancyRate);
  const density = percentile(peers, "density", geography.density, true);
  const transport = Math.min(100, percentile(peers, "transitShare", geography.transitShare) * .7 + percentile(peers, "workFromHomeShare", geography.workFromHomeShare) * .3);
  const base: Record<FactorKey, number> = {
    affordability: (rent + value) / 2, density,
    household: percentile(peers, "avgHouseholdSize", geography.avgHouseholdSize), jobs,
    transportation: transport,
    shortage: Math.max(0, Math.min(100, (100 - vacancy) * .55 + pop * .3 + Math.max(0, pop - housing) * .5)),
    land: Math.max(0, Math.min(100, density * .72 + (100 - percentile(peers, "landSqMi", geography.landSqMi, true)) * .28)),
    pressure: Math.max(0, Math.min(100, pop * .45 + jobs * .35 + rent * .2)), existingMix: 50,
  };
  const scenario = SCENARIOS.find((item) => item.id === scenarioId);
  return scenario ? { ...base, ...scenario.signal } : base;
}

function existingMixFit(geography: GeographyRecord, format: FormatKey) {
  if (format === "apartments" || format === "mixedUse") return Math.min(100, 35 + (geography.multifamilyShare ?? 0) * 1.5);
  if (format === "townhomes") return Math.min(100, 48 + (geography.attachedShare ?? 0) * 3.2);
  if (format === "detached") return Math.min(100, 20 + (geography.detachedShare ?? 0));
  return Math.max(35, 90 - (geography.multifamilyShare ?? 0));
}

export function scoreFormats(geography: GeographyRecord, peers: GeographyRecord[], baseWeights: Weights, scenarioId?: string) {
  const scenario = SCENARIOS.find((item) => item.id === scenarioId);
  const weights = scenario ? { ...baseWeights, ...scenario.weights } : baseWeights;
  const signals = communitySignals(geography, peers, scenarioId);
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  return (Object.keys(FORMAT_INFO) as FormatKey[]).map((key) => {
    const factors = {} as Record<FactorKey, number>;
    for (const factor of Object.keys(weights) as FactorKey[]) factors[factor] = factor === "existingMix" ? existingMixFit(geography, key) : Math.max(0, 100 - Math.abs(signals[factor] - FORMAT_PROFILES[key][factor]) * .72);
    const raw = (Object.keys(weights) as FactorKey[]).reduce((sum, factor) => sum + factors[factor] * weights[factor], 0) / total;
    return { key, ...FORMAT_INFO[key], score: Number(Math.max(0, Math.min(100, raw + FORMAT_ADJUSTMENTS[key])).toFixed(1)), factors };
  }).sort((a, b) => b.score - a.score);
}

export function whyPrioritized(format: FormatKey, signals: Record<FactorKey, number>) {
  if (format === "townhomes") return "Attached homes add capacity while preserving individual entrances and flexible household layouts.";
  if (format === "mixedUse") return "The model values land efficiency, access to jobs, and compatibility with multimodal transportation.";
  if (format === "apartments") return "Higher-density homes respond efficiently to affordability pressure and housing shortage signals.";
  if (format === "masterPlanned") return "Coordinated districts can absorb growth while planning infrastructure and varied housing types together.";
  return signals.household > 65 ? "Larger household patterns and lower-density conditions support private space and flexible layouts." : "Detached housing fits best where land availability and household-space needs outweigh density pressure.";
}

export const money = (value: number | null) => value == null ? "Not available" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
export const compact = (value: number | null) => value == null ? "Not available" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
export const percent = (value: number | null) => value == null ? "Not available" : `${value.toFixed(1)}%`;
export const numeral = (value: number | null, digits = 1) => value == null ? "Not available" : value.toLocaleString("en-US", { maximumFractionDigits: digits });
