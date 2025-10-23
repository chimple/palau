import { useEffect, useMemo, useState } from "react";
import type { RecommendationOptions } from "../adaptive/adaptiveEngine";
import { AdaptiveEngine } from "../adaptive/adaptiveEngine";
import type { RecommendationAlgorithm } from "../adaptive/algorithms";
import type { Grade, LearnerProfile, Recommendation } from "../domain/models";

export interface UseLearningPathArgs {
  grades: Grade[];
  learnerProfile: LearnerProfile;
  options?: RecommendationOptions;
  algorithm?: RecommendationAlgorithm;
}

export interface UseLearningPathResult {
  recommendations: Recommendation[];
  refresh: () => void;
}

export const useLearningPath = ({
  grades,
  learnerProfile,
  options,
  algorithm
}: UseLearningPathArgs): UseLearningPathResult => {
  const engine = useMemo(
    () => new AdaptiveEngine(grades, { algorithm }),
    [grades, algorithm]
  );
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  const run = () => {
    setRecommendations(engine.getRecommendationList(learnerProfile, options));
  };

  const algorithmKey = algorithm?.id ?? "simple";

  const optionsKey = useMemo(
    () =>
      JSON.stringify({
        ...(options ?? {}),
        __algorithm: algorithmKey
      }),
    [options, algorithmKey]
  );

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, learnerProfile, optionsKey]);

  return {
    recommendations,
    refresh: run
  };
};
