import type { AbilityState, BlendWeights, DependencyGraph } from "./types";
import {
  DEFAULT_BLEND_WEIGHTS,
  DEFAULT_MASTERED_THRESHOLD,
  DEFAULT_ZPD_RANGE,
} from "./constants";
import { getIndicator } from "./utils";
import { blendAbility, logistic } from "./utils";

export interface IndicatorSnapshot {
  indicatorId: string;
  probability: number;
  status: "below" | "zpd" | "mastered";
}

export interface GraphSnapshot {
  snapshot: IndicatorSnapshot[];
  masteredIds: string[];
  zpdIds: string[];
  belowIds: string[];
}

export const getIndicatorProbability = (
  graph: DependencyGraph,
  abilities: AbilityState,
  indicatorId: string,
  weights: BlendWeights = DEFAULT_BLEND_WEIGHTS
): number => {
  const indicator = getIndicator(graph, indicatorId);
  return logistic(blendAbility(indicator, abilities, weights) - indicator.difficulty);
};

export const buildGraphSnapshot = (
  graph: DependencyGraph,
  abilities: AbilityState,
  weights: BlendWeights = DEFAULT_BLEND_WEIGHTS,
  zpdRange: [number, number] = DEFAULT_ZPD_RANGE,
  masteredThreshold: number = DEFAULT_MASTERED_THRESHOLD
): GraphSnapshot => {
  const snapshot: IndicatorSnapshot[] = [];
  const masteredIds: string[] = [];
  const zpdIds: string[] = [];
  const belowIds: string[] = [];

  for (const indicator of graph.indicators) {
    const probability = getIndicatorProbability(
      graph,
      abilities,
      indicator.id,
      weights
    );
    let status: IndicatorSnapshot["status"] = "below";
    if (probability >= masteredThreshold) {
      status = "mastered";
      masteredIds.push(indicator.id);
    } else if (probability >= zpdRange[0] && probability <= zpdRange[1]) {
      status = "zpd";
      zpdIds.push(indicator.id);
    } else {
      belowIds.push(indicator.id);
    }
    snapshot.push({
      indicatorId: indicator.id,
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
