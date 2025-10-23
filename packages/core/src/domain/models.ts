export type DependencyType = "prerequisite" | "reinforces" | "unlocks";

export interface LearningIndicator {
  id: string;
  description: string;
  weight: number;
  progress?: number; // 0-1 mastery score for aggregated learners
  estimatedMinutes?: number;
  difficulty?: number; // IRT difficulty (b parameter)
  discrimination?: number; // IRT discrimination (a parameter)
  guessing?: number; // IRT guessing (c parameter)
  slip?: number; // BKT slip probability
}

export interface LearningIndicatorDependency {
  sourceIndicatorId: string;
  targetIndicatorId: string;
  type: DependencyType;
  weight?: number;
}

export interface LearningOutcome {
  id: string;
  name: string;
  indicators: LearningIndicator[];
}

export interface Competency {
  id: string;
  name: string;
  outcomes: LearningOutcome[];
}

export interface Subject {
  id: string;
  name: string;
  competencies: Competency[];
  indicatorDependencies?: LearningIndicatorDependency[];
}

export interface Grade {
  id: string;
  label: string;
  subjects: Subject[];
}

export interface LearnerIndicatorState {
  indicatorId: string;
  mastery: number; // 0-1 score for the learner
  lastPracticedAt?: string;
  attempts?: number;
  eloRating?: number;
  probabilityKnown?: number; // BKT probability of mastery
  successStreak?: number;
  failureStreak?: number;
}

export interface LearnerProfile {
  id: string;
  gradeId: string;
  indicatorStates: LearnerIndicatorState[];
  preferences?: {
    pace?: "accelerated" | "standard" | "revisit";
    focusSubjects?: string[];
  };
}

export interface Recommendation {
  indicator: LearningIndicator;
  outcomeId: string;
  outcomeName: string;
  mastery: number;
  score: number;
  reason: string;
  blockedBy: string[];
}

export type AdaptiveAlgorithmId = "simple" | "irt" | "elo" | "bkt";
