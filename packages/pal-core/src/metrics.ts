import type { AbilityState, BlendWeights, DependencyGraph } from "./types";
import {
  DEFAULT_BLEND_WEIGHTS,
  DEFAULT_MASTERED_THRESHOLD,
  DEFAULT_ZPD_RANGE,
} from "./constants";
import { getSkill } from "./utils";
import { blendAbility, logistic } from "./utils";

export interface SkillSnapshot {
  skillId: string;
  probability: number;
  status: "below" | "zpd" | "mastered";
}

export interface GraphSnapshot {
  snapshot: SkillSnapshot[];
  masteredIds: string[];
  zpdIds: string[];
  belowIds: string[];
}

export const getSkillProbability = (
  graph: DependencyGraph,
  abilities: AbilityState,
  skillId: string,
  weights: BlendWeights = DEFAULT_BLEND_WEIGHTS
): number => {
  const skill = getSkill(graph, skillId);
  return logistic(blendAbility(skill, abilities, weights) - skill.difficulty);
};

export const buildGraphSnapshot = (
  graph: DependencyGraph,
  abilities: AbilityState,
  weights: BlendWeights = DEFAULT_BLEND_WEIGHTS,
  zpdRange: [number, number] = DEFAULT_ZPD_RANGE,
  masteredThreshold: number = DEFAULT_MASTERED_THRESHOLD
): GraphSnapshot => {
  const snapshot: SkillSnapshot[] = [];
  const masteredIds: string[] = [];
  const zpdIds: string[] = [];
  const belowIds: string[] = [];

  for (const skill of graph.skills) {
    const probability = getSkillProbability(
      graph,
      abilities,
      skill.id,
      weights
    );
    let status: SkillSnapshot["status"] = "below";
    if (probability >= masteredThreshold) {
      status = "mastered";
      masteredIds.push(skill.id);
    } else if (probability >= zpdRange[0] && probability <= zpdRange[1]) {
      status = "zpd";
      zpdIds.push(skill.id);
    } else {
      belowIds.push(skill.id);
    }
    snapshot.push({
      skillId: skill.id,
      probability,
      status,
    });
  }

  return {
    snapshot,
    masteredIds,
    zpdIds,
    belowIds,
  };
};
