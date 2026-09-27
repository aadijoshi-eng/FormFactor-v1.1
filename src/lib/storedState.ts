import type { FactorKey, GeographyKind, Weights } from "./model";

export interface StoredComparison {
  id: string;
  geographyKind?: GeographyKind;
  geographyId?: string;
  geographyName?: string;
  cbsa?: string;
  metroName?: string;
  savedAt: string;
  winner: string;
  score: number;
  weights: Weights;
}


function validStoredWeights(value: unknown, factorKeys: FactorKey[]): value is Weights {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return factorKeys.every((factor) => Number.isInteger(candidate[factor]) && Number(candidate[factor]) >= 0 && Number(candidate[factor]) <= 30)
    && factorKeys.reduce((sum, factor) => sum + Number(candidate[factor]), 0) > 0;
}

export interface SanitizedStoredState {
  selectedCbsa?: string;
  selectedCountyFips?: string;
  geographyKind?: GeographyKind;
  weights?: Weights;
  saved: StoredComparison[];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function sanitizeStoredState(value: unknown, factorKeys: FactorKey[]): SanitizedStoredState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { saved: [] };
  const candidate = value as Record<string, unknown>;
  const rawSaved = Array.isArray(candidate.saved) ? candidate.saved : [];
  const saved = rawSaved.flatMap((item): StoredComparison[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const id = optionalString(record.id);
    const savedAt = optionalString(record.savedAt);
    const winner = optionalString(record.winner);
    const score = typeof record.score === "number" && Number.isFinite(record.score) ? record.score : undefined;
    if (!id || !savedAt || !winner || score === undefined || !validStoredWeights(record.weights, factorKeys)) return [];

    const geographyKind = record.geographyKind === "metro" || record.geographyKind === "county" ? record.geographyKind : undefined;
    return [{
      id,
      geographyKind,
      geographyId: optionalString(record.geographyId),
      geographyName: optionalString(record.geographyName),
      cbsa: optionalString(record.cbsa),
      metroName: optionalString(record.metroName),
      savedAt,
      winner,
      score,
      weights: record.weights,
    }];
  }).slice(0, 8);

  return {
    selectedCbsa: optionalString(candidate.selectedCbsa),
    selectedCountyFips: optionalString(candidate.selectedCountyFips),
    geographyKind: candidate.geographyKind === "metro" || candidate.geographyKind === "county" ? candidate.geographyKind : undefined,
    weights: validStoredWeights(candidate.weights, factorKeys) ? candidate.weights : undefined,
    saved,
  };
}
