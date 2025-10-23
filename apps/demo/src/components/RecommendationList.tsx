import type { Recommendation } from "@chimple/palau-core";
import type { ReactNode } from "react";

export interface RecommendationListProps {
  recommendations: Recommendation[];
  renderItem: (recommendation: Recommendation) => ReactNode;
}

export const RecommendationList = ({
  recommendations,
  renderItem
}: RecommendationListProps) => {
  if (recommendations.length === 0) {
    return <p>No recommendations generated yet.</p>;
  }

  return (
    <div>
      {recommendations.map(rec => (
        <div key={rec.indicator.id}>{renderItem(rec)}</div>
      ))}
    </div>
  );
};
