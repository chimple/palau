import type { IndicatorContext } from "../../domain/learningGraph";
import type { LearnerProfile } from "../../domain/models";

export interface AlgorithmContext {
  indicator: IndicatorContext;
  learnerProfile: LearnerProfile;
  masteryMap: Map<string, number>;
}

export interface AlgorithmResult {
  mastery: number;
  score: number;
  reason: string;
}

export interface RecommendationAlgorithm {
  id: string;
  title: string;
  score(context: AlgorithmContext): AlgorithmResult;
}
