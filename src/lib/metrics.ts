import type { GeographyRecord } from "./model.ts";
import { money, numeral } from "./model.ts";

export type MapLayer = "populationGrowth" | "medianIncome" | "medianRent" | "medianHomeValue" | "vacancyRate" | "density";

export function metricValue(record: GeographyRecord, layer: MapLayer) {
  return record[layer];
}

export function compareMetricRecords(a: GeographyRecord, b: GeographyRecord, layer: MapLayer, direction: "highest" | "lowest") {
  const av = metricValue(a, layer);
  const bv = metricValue(b, layer);
  const tie = a.name.localeCompare(b.name) || a.geoId.localeCompare(b.geoId);
  if (av == null && bv == null) return tie;
  if (av == null) return 1;
  if (bv == null) return -1;
  return (direction === "highest" ? bv - av : av - bv) || tie;
}

export function metricRank(record: GeographyRecord, records: GeographyRecord[], layer: MapLayer, direction: "highest" | "lowest" = "highest") {
  const ranked = records.filter((candidate) => metricValue(candidate, layer) != null)
    .sort((a, b) => compareMetricRecords(a, b, layer, direction));
  const index = ranked.findIndex((candidate) => candidate.geoId === record.geoId);
  return index >= 0 ? { rank: index + 1, total: ranked.length } : null;
}

export function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function metricDeltaFromMedian(record: GeographyRecord, records: GeographyRecord[], layer: MapLayer) {
  const value = metricValue(record, layer);
  const benchmark = median(records.map((candidate) => metricValue(candidate, layer)).filter((candidate): candidate is number => candidate != null));
  if (value == null || benchmark == null) return null;
  return { value, benchmark, delta: value - benchmark };
}

export function metricDeltaFormat(layer: MapLayer, delta: number) {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const magnitude = Math.abs(delta);
  if (layer === "medianIncome" || layer === "medianRent" || layer === "medianHomeValue") return `${sign}${money(magnitude)}`;
  if (layer === "density") return `${sign}${numeral(magnitude, 0)} / sq. mi.`;
  // Percentage metrics are stored on a 0–100 scale, not as fractions.
  return `${sign}${magnitude.toFixed(1)} pp`;
}
