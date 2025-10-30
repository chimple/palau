import {
  DEFAULT_BLEND_WEIGHTS,
  DEFAULT_LEARNING_RATES,
} from "./constants";
import type { AbilityUpdateOptions, AbilityUpdateResult } from "./types";
import { blendAbility, cloneAbilityState, getIndicator, logistic } from "./utils";

export const updateAbilities = (
  options: AbilityUpdateOptions
): AbilityUpdateResult => {
  const { graph, abilities, event } = options;
  const weights = options.blendWeights ?? DEFAULT_BLEND_WEIGHTS;
  const rates = options.learningRates ?? DEFAULT_LEARNING_RATES;
  const indicator = getIndicator(graph, event.indicatorId);
  const newState = cloneAbilityState(abilities);

  const priorBlend = blendAbility(indicator, newState, weights) - indicator.difficulty;
  const probabilityBefore = logistic(priorBlend);
  const outcome = event.correct ? 1 : 0;
  const error = outcome - probabilityBefore;

  const currentIndicator = newState.indicator[indicator.id] ?? 0;
  const currentOutcome =
    newState.outcome[indicator.learningOutcomeId] ?? 0;
  const currentCompetency =
    newState.competency[indicator.competencyId] ?? 0;
  const currentGrade = newState.grade[indicator.gradeId] ?? 0;

  newState.indicator[indicator.id] =
    currentIndicator + rates.indicator * error;
  newState.outcome[indicator.learningOutcomeId] =
    currentOutcome + rates.outcome * error;
  newState.competency[indicator.competencyId] =
    currentCompetency + rates.competency * error;
  newState.grade[indicator.gradeId] =
    currentGrade + rates.grade * error;

  const posteriorBlend =
    blendAbility(indicator, newState, weights) - indicator.difficulty;
  const probabilityAfter = logistic(posteriorBlend);

  return {
    abilities: newState,
    probabilityBefore,
    probabilityAfter,
  };
};
