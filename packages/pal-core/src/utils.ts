import type {
  AbilityState,
  BlendWeights,
  DependencyGraph,
  LearningIndicator,
} from "./types";
import { DEFAULT_BLEND_WEIGHTS, DEFAULT_SCALE } from "./constants";

export const logistic = (x: number, scale: number = DEFAULT_SCALE): number =>
  1 / (1 + Math.exp(-x / scale));

export const getAbilityValue = (
  container: Record<string, number>,
  id: string
): number => container[id] ?? 0;

export const cloneAbilityState = (state: AbilityState): AbilityState => ({
  indicator: { ...state.indicator },
  outcome: { ...state.outcome },
  competency: { ...state.competency },
  domain: { ...state.domain },
  subject: { ...state.subject },
  grade: { ...state.grade },
});

export const blendAbility = (
  indicator: LearningIndicator,
  abilities: AbilityState,
  weights: BlendWeights = DEFAULT_BLEND_WEIGHTS
): number => {
  const thetaLi = getAbilityValue(abilities.indicator, indicator.id);
  const thetaLO = getAbilityValue(
    abilities.outcome,
    indicator.learningOutcomeId
  );
  const thetaCompetency = getAbilityValue(
    abilities.competency,
    indicator.competencyId
  );
  const thetaDomain = getAbilityValue(abilities.domain, indicator.domainId);
  const thetaSubject = getAbilityValue(abilities.subject, indicator.subjectId);
  const thetaGrade = getAbilityValue(abilities.grade, indicator.gradeId);

  return (
    thetaLi * weights.indicator +
    thetaLO * weights.outcome +
    thetaCompetency * weights.competency +
    thetaDomain * weights.domain +
    thetaSubject * weights.subject +
    thetaGrade * weights.grade
  );
};

export const indexGraphByIndicator = (graph: DependencyGraph) => {
  const indicatorById = new Map<string, LearningIndicator>();
  const prerequisites = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();

  for (const indicator of graph.indicators) {
    indicatorById.set(indicator.id, indicator);
    prerequisites.set(indicator.id, indicator.prerequisites);
    for (const prereq of indicator.prerequisites) {
      const list = dependents.get(prereq) ?? [];
      list.push(indicator.id);
      dependents.set(prereq, list);
    }
    if (!dependents.has(indicator.id)) {
      dependents.set(indicator.id, []);
    }
  }

  return {
    indicatorById,
    prerequisites,
    dependents,
  };
};

export const getIndicator = (
  graph: DependencyGraph,
  id: string
): LearningIndicator => {
  const indicator = graph.indicators.find((li) => li.id === id);
  if (!indicator) {
    throw new Error(`Unknown indicator "${id}"`);
  }
  return indicator;
};
