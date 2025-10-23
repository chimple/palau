import type { Recommendation } from "../domain/models";

export interface OutcomeSeriesPoint {
  indicatorId: string;
  label: string;
  value: number;
}

export interface OutcomeSeries {
  outcomeId: string;
  outcomeName: string;
  points: OutcomeSeriesPoint[];
}

export const toOutcomeSeries = (
  recommendations: Recommendation[]
): OutcomeSeries[] => {
  const grouped = new Map<string, OutcomeSeries>();

  recommendations.forEach(rec => {
    const existing = grouped.get(rec.outcomeId);
    const series: OutcomeSeries =
      existing ??
      {
        outcomeId: rec.outcomeId,
        outcomeName: rec.outcomeName,
        points: []
      };

    series.points.push({
      indicatorId: rec.indicator.id,
      label: rec.indicator.description,
      value: Math.round(rec.mastery * 100)
    });

    grouped.set(rec.outcomeId, series);
  });

  return Array.from(grouped.values());
};
