export interface Grade {
  id: string;
  label: string;
}

export interface Competency {
  id: string;
  label: string;
  gradeId: string;
}

export interface LearningOutcome {
  id: string;
  label: string;
  competencyId: string;
}

export interface LearningIndicator {
  id: string;
  label: string;
  learningOutcomeId: string;
  competencyId: string;
  gradeId: string;
  difficulty: number;
  prerequisites: string[];
}

export interface DependencyGraph {
  indicators: LearningIndicator[];
  learningOutcomes: LearningOutcome[];
  competencies: Competency[];
  grades: Grade[];
  startIndicatorId: string;
}

export interface AbilityState {
  indicator: Record<string, number>;
  outcome: Record<string, number>;
  competency: Record<string, number>;
  grade: Record<string, number>;
}

export interface LearningRates {
  indicator: number;
  outcome: number;
  competency: number;
  grade: number;
}

export interface BlendWeights {
  indicator: number;
  outcome: number;
  competency: number;
  grade: number;
}

export interface RecommendationContext {
  targetIndicatorId: string;
  candidateId: string;
  probability: number;
  status: RecommendationStatus;
  traversed: string[];
  notes?: string;
}

export interface RecommendationRequest {
  graph: DependencyGraph;
  abilities: AbilityState;
  targetIndicatorId: string;
  zpdRange?: [number, number];
  blendWeights?: BlendWeights;
  masteredThreshold?: number;
}

export type RecommendationStatus =
  | "recommended"
  | "auto-mastered"
  | "needs-remediation"
  | "no-candidate";

export interface OutcomeEvent {
  indicatorId: string;
  correct: boolean;
  timestamp?: number;
}

export interface AbilityUpdateOptions {
  graph: DependencyGraph;
  abilities: AbilityState;
  event: OutcomeEvent;
  blendWeights?: BlendWeights;
  learningRates?: LearningRates;
}

export interface AbilityUpdateResult {
  abilities: AbilityState;
  probabilityBefore: number;
  probabilityAfter: number;
}
