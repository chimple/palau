export interface Grade {
  id: string;
  label: string;
}

export interface Subject {
  id: string;
  label: string;
  gradeId: string;
}

export interface Domain {
  id: string;
  label: string;
  gradeId: string;
  subjectId: string;
}

export interface Competency {
  id: string;
  label: string;
  gradeId: string;
  subjectId: string;
  domainId: string;
}

export interface LearningOutcome {
  id: string;
  label: string;
  competencyId: string;
  domainId: string;
  subjectId: string;
  gradeId: string;
}

export interface LearningIndicator {
  id: string;
  label: string;
  learningOutcomeId: string;
  competencyId: string;
  domainId: string;
  subjectId: string;
  gradeId: string;
  difficulty: number;
  prerequisites: string[];
}

export interface DependencyGraph {
  indicators: LearningIndicator[];
  learningOutcomes: LearningOutcome[];
  competencies: Competency[];
  domains: Domain[];
  subjects: Subject[];
  grades: Grade[];
  startIndicatorId: string;
}

export interface AbilityState {
  indicator: Record<string, number>;
  outcome: Record<string, number>;
  competency: Record<string, number>;
  domain: Record<string, number>;
  subject: Record<string, number>;
  grade: Record<string, number>;
}

export interface LearningRates {
  indicator: number;
  outcome: number;
  competency: number;
  domain: number;
  subject: number;
  grade: number;
}

export interface BlendWeights {
  indicator: number;
  outcome: number;
  competency: number;
  domain: number;
  subject: number;
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
