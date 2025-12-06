import {
  DEFAULT_BLEND_WEIGHTS,
  DEFAULT_LEARNING_RATES,
} from "./constants";
import type { AbilityUpdateOptions, AbilityUpdateResult } from "./types";
import { blendAbility, cloneAbilityState, getSkill, logistic } from "./utils";

export const updateAbilities = (
  options: AbilityUpdateOptions
): AbilityUpdateResult => {
  const { graph, abilities, events } = options;
  if (!events || events.length === 0) {
    throw new Error("At least one outcome event is required.");
  }
  const skillId = events[0].skillId;
  for (const evt of events) {
    if (evt.skillId !== skillId) {
      throw new Error("All events must belong to the same skillId.");
    }
  }

  const weights = options.blendWeights ?? DEFAULT_BLEND_WEIGHTS;
  const rates = options.learningRates ?? DEFAULT_LEARNING_RATES;
  const skill = getSkill(graph, skillId);
  const newState = cloneAbilityState(abilities);

  const abilityBefore = {
    skill: newState.skill[skill.id] ?? 0,
    outcome: newState.outcome[skill.outcomeId] ?? 0,
    competency: newState.competency[skill.competencyId] ?? 0,
    domain: newState.domain[skill.domainId] ?? 0,
    subject: newState.subject[skill.subjectId] ?? 0,
  };

  const priorBlend = blendAbility(skill, newState, weights) - skill.difficulty;
  const probabilityBefore = logistic(priorBlend);

  let probabilityAfter = probabilityBefore;

  for (const event of events) {
    const outcome = event.correct ? 1 : 0;
    const currentSkill = newState.skill[skill.id] ?? 0;
    const currentOutcome = newState.outcome[skill.outcomeId] ?? 0;
    const currentCompetency = newState.competency[skill.competencyId] ?? 0;
    const currentDomain = newState.domain[skill.domainId] ?? 0;
    const currentSubject = newState.subject[skill.subjectId] ?? 0;

    const blendBeforeUpdate =
      blendAbility(skill, newState, weights) - skill.difficulty;
    const pBeforeEvent = logistic(blendBeforeUpdate);
    const error = outcome - pBeforeEvent;

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
    probabilityAfter = logistic(posteriorBlend);
  }

  const abilityAfter = {
    skill: newState.skill[skill.id] ?? 0,
    outcome: newState.outcome[skill.outcomeId] ?? 0,
    competency: newState.competency[skill.competencyId] ?? 0,
    domain: newState.domain[skill.domainId] ?? 0,
    subject: newState.subject[skill.subjectId] ?? 0,
  };

  return {
    abilities: newState,
    probabilityBefore,
    probabilityAfter,
    abilityBefore,
    abilityAfter,
    skillId: skill.id,
  };
};
