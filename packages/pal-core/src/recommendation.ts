import {
  DEFAULT_BLEND_WEIGHTS,
  DEFAULT_MASTERED_THRESHOLD,
  DEFAULT_ZPD_RANGE,
} from "./constants";
import type { RecommendationContext, RecommendationRequest } from "./types";
import { blendAbility, indexGraphByIndicator, logistic } from "./utils";

export const recommendNextIndicator = (
  request: RecommendationRequest
): RecommendationContext => {
  const weights = request.blendWeights ?? DEFAULT_BLEND_WEIGHTS;
  const [zpdMin, zpdMax] = request.zpdRange ?? DEFAULT_ZPD_RANGE;
  const masteredThreshold =
    request.masteredThreshold ?? DEFAULT_MASTERED_THRESHOLD;
  const { indicatorById } = indexGraphByIndicator(request.graph);
  const visited = new Set<string>();

  const evaluate = (
    indicatorId: string,
    trail: string[]
  ): RecommendationContext => {
    if (visited.has(indicatorId)) {
      return {
        targetIndicatorId: request.targetIndicatorId,
        candidateId: indicatorId,
        probability: 0,
        status: "no-candidate",
        traversed: trail,
        notes: "Cycle detected - already evaluated",
      };
    }
    visited.add(indicatorId);
    const indicator = indicatorById.get(indicatorId);
    if (!indicator) {
      return {
        targetIndicatorId: request.targetIndicatorId,
        candidateId: indicatorId,
        probability: 0,
        status: "no-candidate",
        traversed: trail,
        notes: "Indicator missing from graph definition",
      };
    }

    const updatedTrail = [...trail, indicatorId];

    for (const prereqId of indicator.prerequisites) {
      const prereq = indicatorById.get(prereqId);
      if (!prereq) {
        continue;
      }
      const prob =
        logistic(
          blendAbility(prereq, request.abilities, weights) - prereq.difficulty
        ) ?? 0;

      if (prob >= masteredThreshold) {
        // Treat as mastered; continue to next prerequisite.
        continue;
      }

      if (prob >= zpdMin && prob <= zpdMax) {
        return {
          targetIndicatorId: request.targetIndicatorId,
          candidateId: prereqId,
          probability: prob,
          status: "recommended",
          traversed: [...updatedTrail, prereqId],
          notes: "Prerequisite in ZPD window",
        };
      }

      // Probability too low; recurse backward.
      if (prob < zpdMin) {
        const deeper = evaluate(prereqId, updatedTrail);
        if (deeper.status !== "no-candidate") {
          return deeper;
        }
      }
    }

    const selfProb =
      logistic(
        blendAbility(indicator, request.abilities, weights) -
          indicator.difficulty
      ) ?? 0;

    if (selfProb >= zpdMin && selfProb <= zpdMax) {
      return {
        targetIndicatorId: request.targetIndicatorId,
        candidateId: indicatorId,
        probability: selfProb,
        status: "recommended",
        traversed: updatedTrail,
        notes:
          indicatorId === request.targetIndicatorId
            ? "Gate reopened - target is in ZPD"
            : "Candidate indicator in ZPD",
      };
    }

    if (selfProb >= masteredThreshold) {
      return {
        targetIndicatorId: request.targetIndicatorId,
        candidateId: indicatorId,
        probability: selfProb,
        status: "auto-mastered",
        traversed: updatedTrail,
        notes:
          indicatorId === request.targetIndicatorId
            ? "Target appears mastered; advance to successors"
            : "Prerequisite appears mastered",
      };
    }

    if (indicator.prerequisites.length === 0) {
      return {
        targetIndicatorId: request.targetIndicatorId,
        candidateId: indicatorId,
        probability: selfProb,
        status: "needs-remediation",
        traversed: updatedTrail,
        notes: "Reached root indicator outside ZPD - remediation suggested",
      };
    }

    return {
      targetIndicatorId: request.targetIndicatorId,
      candidateId: indicatorId,
      probability: selfProb,
      status: "no-candidate",
      traversed: updatedTrail,
      notes: "No candidate found in ZPD; consider adjusting target",
    };
  };

  return evaluate(request.targetIndicatorId, []);
};
