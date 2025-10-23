export const toOutcomeSeries = (recommendations) => {
    const grouped = new Map();
    recommendations.forEach(rec => {
        const existing = grouped.get(rec.outcomeId);
        const series = existing ??
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
