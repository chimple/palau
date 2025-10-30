import type { AbilityState, BlendWeights, LearningRates } from "./types";

export const DEFAULT_BLEND_WEIGHTS: BlendWeights = {
  indicator: 0.45,
  outcome: 0.35,
  competency: 0.15,
  grade: 0.05,
};

export const DEFAULT_LEARNING_RATES: LearningRates = {
  indicator: 0.12,
  outcome: 0.08,
  competency: 0.04,
  grade: 0.03,
};

export const DEFAULT_ZPD_RANGE: [number, number] = [0.5, 0.8];
export const DEFAULT_MASTERED_THRESHOLD = 0.8;
export const DEFAULT_SCALE = 1;

export const createEmptyAbilityState = (): AbilityState => ({
  indicator: {},
  outcome: {},
  competency: {},
  grade: {},
});
