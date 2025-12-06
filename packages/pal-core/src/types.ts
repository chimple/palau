export interface Subject {
  id: string;
  label: string;
}

export interface Domain {
  id: string;
  label: string;
  subjectId: string;
}

export interface Competency {
  id: string;
  label: string;
  subjectId: string;
  domainId: string;
}

export interface Outcome {
  id: string;
  label: string;
  competencyId: string;
  domainId: string;
  subjectId: string;
}

export interface Skill {
  id: string;
  label: string;
  outcomeId: string;
  competencyId: string;
  domainId: string;
  subjectId: string;
  difficulty: number;
  prerequisites: string[];
}

export interface DependencyGraph {
  skills: Skill[];
  outcomes: Outcome[];
  competencies: Competency[];
  domains: Domain[];
  subjects: Subject[];
  startSkillId: string;
}

export interface AbilityState {
  skill: Record<string, number>;
  outcome: Record<string, number>;
  competency: Record<string, number>;
  domain: Record<string, number>;
  subject: Record<string, number>;
}

export interface LearningRates {
  skill: number;
  outcome: number;
  competency: number;
  domain: number;
  subject: number;
}

export interface BlendWeights {
  skill: number;
  outcome: number;
  competency: number;
  domain: number;
  subject: number;
}

export interface RecommendationContext {
  targetSubjectId: string;
  candidateId: string;
  probability: number;
  status: RecommendationStatus;
  traversed: string[];
  notes?: string;
}

export interface RecommendationRequest {
  graph: DependencyGraph;
  abilities: AbilityState;
  subjectId: string;
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
  skillId: string;
  correct: boolean;
  timestamp?: number;
}

export interface AbilityUpdateOptions {
  graph: DependencyGraph;
  abilities: AbilityState;
  events: OutcomeEvent[];
  blendWeights?: BlendWeights;
  learningRates?: LearningRates;
}

export interface AbilitySnapshot {
  skill: number;
  outcome: number;
  competency: number;
  domain: number;
  subject: number;
}

export interface AbilityUpdateResult {
  abilities: AbilityState;
  probabilityBefore: number;
  probabilityAfter: number;
  abilityBefore: AbilitySnapshot;
  abilityAfter: AbilitySnapshot;
  skillId: string;
}
