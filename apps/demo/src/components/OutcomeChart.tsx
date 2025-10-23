import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import type { OutcomeSeries } from "@chimple/palau-core";

export interface OutcomeChartProps {
  series: OutcomeSeries[];
}

export const OutcomeChart = ({ series }: OutcomeChartProps) => {
  const data = series.flatMap(outcome =>
    outcome.points.map(point => ({
      outcome: outcome.outcomeName,
      label: point.label,
      value: point.value
    }))
  );

  if (data.length === 0) {
    return <p>No indicators available yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={data} margin={{ top: 16, right: 32, bottom: 32, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12 }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={80}
        />
        <YAxis domain={[0, 100]} tickFormatter={value => `${value}%`} />
        <Tooltip formatter={value => `${value}%`} />
        <Bar dataKey="value" fill="#3182CE" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};
