import type { IndicatorContext, IndicatorGraph } from "../../domain/learningGraph";
import type { LearnerProfile } from "../../domain/models";

export interface LearnerAbilityMaps {
  indicators: Map<string, number>;
  outcomes: Map<string, number>;
  competencies: Map<string, number>;
  grades: Map<string, number>;
}

export interface AlgorithmContext {
  indicator: IndicatorContext;
  learnerProfile: LearnerProfile;
  masteryMap: Map<string, number>;
  graph: IndicatorGraph;
  abilities: LearnerAbilityMaps;
}

export interface AlgorithmResult {
  mastery: number;
  score: number;
  reason: string;
  probability?: number;
  focusIndicatorId?: string;
}

export interface AlgorithmObservation {
  indicatorId: string;
  score: number;
  timestamp?: string;
}

export interface RecommendationAlgorithm {
  id: string;
  title: string;
  score(context: AlgorithmContext): AlgorithmResult;
  update?(context: AlgorithmContext, observation: AlgorithmObservation, result: AlgorithmResult): void;
}
