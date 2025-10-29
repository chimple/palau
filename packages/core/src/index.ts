export * from "./domain/models";
export {
  type IndicatorGraph,
  type IndicatorContext,
  buildIndicatorGraph,
  detectCycles,
  findBlockedBy,
  topologicalSort
} from "./domain/learningGraph";
export { AdaptiveEngine } from "./adaptive/adaptiveEngine";
export type {
  AdaptiveEngineOptions,
  RecommendationOptions
} from "./adaptive/adaptiveEngine";
export {
  SimpleMasteryAlgorithm,
  IRTAlgorithm,
  EloAlgorithm,
  BayesianKnowledgeTracingAlgorithm,
  ModifiedEloAlgorithm
} from "./adaptive/algorithms";
export type {
  RecommendationAlgorithm,
  AlgorithmContext,
  AlgorithmResult,
  LearnerAbilityMaps,
  AlgorithmObservation
} from "./adaptive/algorithms";
export { useLearningPath } from "./hooks/useLearningPath";
export { IndicatorProgress } from "./components/IndicatorProgress";
export { toOutcomeSeries } from "./analytics/outcomeSeries";
export type { OutcomeSeries } from "./analytics/outcomeSeries";
export { PersonalizationService } from "./services/personalizationService";
