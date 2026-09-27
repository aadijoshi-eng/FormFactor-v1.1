import type { County, FactorKey, FormatKey, StateRecord, Weights } from "./model";

export type AtlasRankDirection = "highest" | "lowest";

export interface AtlasLinkResolution {
  stateFips?: string;
  countyFips?: string;
  layer?: string;
  countyCompareFips: string[];
  pinsSpecified: boolean;
  countyRankDirection?: AtlasRankDirection;
  housingFitFormat?: FormatKey;
  weights?: Weights;
}



export interface AtlasShareState {
  stateFips: string;
  countyFips?: string;
  layer: string;
  countyCompareFips: string[];
  countyRankDirection: AtlasRankDirection;
  housingFitFormat: FormatKey;
  weights: Weights;
}

export function writeAtlasShareParams(
  params: URLSearchParams,
  state: AtlasShareState,
  factorKeys: FactorKey[],
): URLSearchParams {
  params.set("ffState", state.stateFips);
  if (state.countyFips) params.set("ffCounty", state.countyFips);
  else params.delete("ffCounty");
  params.set("ffLayer", state.layer);
  params.set("ffRank", state.countyRankDirection);
  params.set("ffFit", state.housingFitFormat);
  params.set("ffW", factorKeys.map((factor) => state.weights[factor]).join(","));
  params.set("ffPins", state.countyCompareFips.join(","));
  return params;
}

export function atlasShareCountyFips(
  atlasMode: "states" | "counties",
  selectedCountyFips?: string,
): string | undefined {
  return atlasMode === "counties" ? selectedCountyFips : undefined;
}

export interface AtlasStoredResolution {
  selectedFips?: string;
  selectedCountyFips?: string;
  atlasMode?: "states" | "counties";
  analysisId?: string;
  layer?: string;
  countyCompareFips: string[];
  countyRankDirection?: AtlasRankDirection;
  housingFitFormat?: FormatKey;
}

export function sanitizeAtlasStoredState(
  value: unknown,
  layerKeys: string[],
  formatKeys: FormatKey[],
): AtlasStoredResolution {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { countyCompareFips: [] };
  const candidate = value as Record<string, unknown>;
  const selectedFips = typeof candidate.selectedFips === "string" && /^\d{2}$/.test(candidate.selectedFips) ? candidate.selectedFips : undefined;
  const selectedCountyFips = typeof candidate.selectedCountyFips === "string" && /^\d{5}$/.test(candidate.selectedCountyFips) && (!selectedFips || candidate.selectedCountyFips.startsWith(selectedFips)) ? candidate.selectedCountyFips : undefined;
  const atlasMode = candidate.atlasMode === "states" || candidate.atlasMode === "counties" ? candidate.atlasMode : undefined;
  const analysisId = typeof candidate.analysisId === "string" && /^(metro|county):\d+$/.test(candidate.analysisId) ? candidate.analysisId : undefined;
  const layer = typeof candidate.layer === "string" && layerKeys.includes(candidate.layer) ? candidate.layer : undefined;
  const countyRankDirection = candidate.countyRankDirection === "highest" || candidate.countyRankDirection === "lowest"
    ? candidate.countyRankDirection
    : undefined;
  const housingFitFormat = typeof candidate.housingFitFormat === "string" && formatKeys.includes(candidate.housingFitFormat as FormatKey)
    ? candidate.housingFitFormat as FormatKey
    : undefined;
  const countyCompareFips = Array.isArray(candidate.countyCompareFips)
    ? candidate.countyCompareFips
      .filter((fips): fips is string => typeof fips === "string")
      .filter((fips, index, all) => all.indexOf(fips) === index)
      .slice(0, 3)
    : [];
  return { selectedFips, selectedCountyFips, atlasMode, analysisId, layer, countyCompareFips, countyRankDirection, housingFitFormat };
}

export function validWeights(value: unknown, factorKeys: FactorKey[]): value is Weights {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return factorKeys.every((factor) => Number.isInteger(candidate[factor]) && Number(candidate[factor]) >= 0 && Number(candidate[factor]) <= 30)
    && factorKeys.reduce((sum, factor) => sum + Number(candidate[factor]), 0) > 0;
}

export function resolveAtlasLinkState(
  params: URLSearchParams,
  states: StateRecord[],
  counties: County[],
  layerKeys: string[],
  formatKeys: FormatKey[],
  factorKeys: FactorKey[],
): AtlasLinkResolution {
  const requestedState = params.get("ffState") || undefined;
  const stateFips = requestedState && states.some((state) => state.fips === requestedState) ? requestedState : undefined;

  const requestedCounty = params.get("ffCounty") || undefined;
  const county = requestedCounty ? counties.find((candidate) => candidate.countyFips === requestedCounty) : undefined;
  const countyFips = county && (!stateFips || county.stateFips === stateFips) ? county.countyFips : undefined;
  const effectiveStateFips = stateFips || (countyFips ? county?.stateFips : undefined);

  const layerParam = params.get("ffLayer") || undefined;
  const rankParam = params.get("ffRank");
  const fitParam = params.get("ffFit") as FormatKey | null;
  const pinsSpecified = params.has("ffPins");
  const requestedPins = (params.get("ffPins") || "")
    .split(",")
    .filter(Boolean)
    .filter((fips, index, all) => all.indexOf(fips) === index);
  const firstValidPinnedCounty = requestedPins
    .map((fips) => counties.find((candidate) => candidate.countyFips === fips))
    .find(Boolean);
  const pinnedStateFips = effectiveStateFips || firstValidPinnedCounty?.stateFips;
  const resolvedStateFips = effectiveStateFips || pinnedStateFips;
  const countyCompareFips = requestedPins
    .filter((fips) => counties.some((candidate) => candidate.countyFips === fips && (!pinnedStateFips || candidate.stateFips === pinnedStateFips)))
    .slice(0, 3);

  const weightValues = (params.get("ffW") || "").split(",").map((value) => Number(value));
  const weightsCandidate = weightValues.length === factorKeys.length
    ? Object.fromEntries(factorKeys.map((factor, index) => [factor, weightValues[index]]))
    : undefined;

  return {
    stateFips: resolvedStateFips,
    countyFips,
    layer: layerParam && layerKeys.includes(layerParam) ? layerParam : undefined,
    countyCompareFips,
    pinsSpecified,
    countyRankDirection: rankParam === "lowest" ? "lowest" : rankParam === "highest" ? "highest" : undefined,
    housingFitFormat: fitParam && formatKeys.includes(fitParam) ? fitParam : undefined,
    weights: validWeights(weightsCandidate, factorKeys) ? weightsCandidate : undefined,
  };
}
