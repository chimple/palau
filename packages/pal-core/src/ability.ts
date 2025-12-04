import {
  DEFAULT_BLEND_WEIGHTS,
  DEFAULT_LEARNING_RATES,
} from "./constants";
import type { AbilityUpdateOptions, AbilityUpdateResult } from "./types";
import { blendAbility, cloneAbilityState, getSkill, logistic } from "./utils";

export const updateAbilities = (
  options: AbilityUpdateOptions
): AbilityUpdateResult => {
  const { graph, abilities, event } = options;
  const weights = options.blendWeights ?? DEFAULT_BLEND_WEIGHTS;
  const rates = options.learningRates ?? DEFAULT_LEARNING_RATES;
  const skill = getSkill(graph, event.skillId);
  const newState = cloneAbilityState(abilities);

  const priorBlend = blendAbility(skill, newState, weights) - skill.difficulty;
  const probabilityBefore = logistic(priorBlend);
  const outcome = event.correct ? 1 : 0;
  const error = outcome - probabilityBefore;

  const currentSkill = newState.skill[skill.id] ?? 0;
  const currentOutcome =
    newState.outcome[skill.outcomeId] ?? 0;
  const currentCompetency =
    newState.competency[skill.competencyId] ?? 0;
  const currentDomain = newState.domain[skill.domainId] ?? 0;
  const currentSubject = newState.subject[skill.subjectId] ?? 0;

  newState.skill[skill.id] = currentSkill + rates.skill * error;
  newState.outcome[skill.outcomeId] =
    currentOutcome + rates.outcome * error;
  newState.competency[skill.competencyId] =
    currentCompetency + rates.competency * error;
  newState.domain[skill.domainId] =
    currentDomain + rates.domain * error;
  newState.subject[skill.subjectId] =
    currentSubject + rates.subject * error;

  const posteriorBlend =
    blendAbility(skill, newState, weights) - skill.difficulty;
  const probabilityAfter = logistic(posteriorBlend);

  return {
    abilities: newState,
    probabilityBefore,
    probabilityAfter,
  };
};
