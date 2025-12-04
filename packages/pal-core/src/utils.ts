import type {
  AbilityState,
  BlendWeights,
  DependencyGraph,
  Skill,
} from "./types";
import { DEFAULT_BLEND_WEIGHTS, DEFAULT_SCALE } from "./constants";

export const logistic = (x: number, scale: number = DEFAULT_SCALE): number =>
  1 / (1 + Math.exp(-x / scale));

export const getAbilityValue = (
  container: Record<string, number>,
  id: string
): number => container[id] ?? 0;

export const cloneAbilityState = (state: AbilityState): AbilityState => ({
  skill: { ...state.skill },
  outcome: { ...state.outcome },
  competency: { ...state.competency },
  domain: { ...state.domain },
  subject: { ...state.subject },
});

export const blendAbility = (
  skill: Skill,
  abilities: AbilityState,
  weights: BlendWeights = DEFAULT_BLEND_WEIGHTS
): number => {
  const thetaLi = getAbilityValue(abilities.skill, skill.id);
  const thetaLO = getAbilityValue(abilities.outcome, skill.outcomeId);
  const thetaCompetency = getAbilityValue(
    abilities.competency,
    skill.competencyId
  );
  const thetaDomain = getAbilityValue(abilities.domain, skill.domainId);
  const thetaSubject = getAbilityValue(abilities.subject, skill.subjectId);

  return (
    thetaLi * weights.skill +
    thetaLO * weights.outcome +
    thetaCompetency * weights.competency +
    thetaDomain * weights.domain +
    thetaSubject * weights.subject
  );
};

export const indexGraphBySkill = (graph: DependencyGraph) => {
  const skillById = new Map<string, Skill>();
  const prerequisites = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();

  for (const skill of graph.skills) {
    skillById.set(skill.id, skill);
    prerequisites.set(skill.id, skill.prerequisites);
    for (const prereq of skill.prerequisites) {
      const list = dependents.get(prereq) ?? [];
      list.push(skill.id);
      dependents.set(prereq, list);
    }
    if (!dependents.has(skill.id)) {
      dependents.set(skill.id, []);
    }
  }

  return {
    skillById,
    prerequisites,
    dependents,
  };
};

export const getSkill = (
  graph: DependencyGraph,
  id: string
): Skill => {
  const skill = graph.skills.find((li) => li.id === id);
  if (!skill) {
    throw new Error(`Unknown skill "${id}"`);
  }
  return skill;
};
