import type { Recommendation } from "../domain/models";

export interface IndicatorProgressProps {
  recommendation: Recommendation;
}

const getProgressColor = (value: number) => {
  if (value >= 0.75) {
    return "#3BA272";
  }
  if (value >= 0.5) {
    return "#F7B733";
  }
  return "#F05D5E";
};

export const IndicatorProgress = ({ recommendation }: IndicatorProgressProps) => {
  const percent = Math.round(recommendation.mastery * 100);
  const color = getProgressColor(recommendation.mastery);

  return (
    <div
      style={{
        border: "1px solid #D9D9D9",
        borderRadius: 8,
        padding: "0.75rem",
        marginBottom: "0.5rem"
      }}
    >
      <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>
        {recommendation.indicator.description}
      </h3>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ flex: 1, height: 8, background: "#F0F0F0", borderRadius: 4 }}>
          <div
            style={{
              width: `${percent}%`,
              height: "100%",
              background: color,
              borderRadius: 4
            }}
          />
        </div>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{percent}%</span>
      </div>
      {recommendation.blockedBy.length > 0 ? (
        <p style={{ margin: "0.5rem 0 0 0", color: "#F05D5E" }}>
          Blocked by: {recommendation.blockedBy.join(", ")}
        </p>
      ) : (
        <p style={{ margin: "0.5rem 0 0 0", color: "#6F7D8C" }}>
          {recommendation.reason}
        </p>
      )}
    </div>
  );
};
