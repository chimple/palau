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
  const { indicatorById, dependents } = indexGraphByIndicator(request.graph);
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

    // Fallback candidate to suggest remediation on the nearest non-mastered
    // prerequisite when deeper recursion fails to find any ZPD candidate.
    let fallbackRemediation: RecommendationContext | null = null;

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
        // If deeper traversal returned no candidate, record this prerequisite
        // as a nearest non-mastered remediation candidate (but don't return
        // immediately — continue searching other prerequisites for a better
        // candidate). If no candidate is found anywhere, we'll fall back to
        // returning this remediation suggestion.
        if (!fallbackRemediation) {
          fallbackRemediation = {
            targetIndicatorId: request.targetIndicatorId,
            candidateId: prereqId,
            probability: prob,
            status: "needs-remediation",
            traversed: [...updatedTrail, prereqId],
            notes: "Nearest non-mastered prerequisite requires remediation",
          };
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
      // If the current indicator (often the target) appears mastered, try to
      // advance to its successors (dependents) and select an appropriate
      // candidate among them. Preference:
      //  1) successors whose prerequisites are all mastered
      //  2) among those, prefer successors in ZPD (closest to masteredThreshold)
      //  3) if none in ZPD, pick the successor with highest probability
      // If no suitable successor is found, fall back to returning auto-mastered
      // for the current indicator.
      if (indicatorId === request.targetIndicatorId) {
        // Forward-search among dependents to find the next actionable
        // candidate. We perform a BFS over successors where prerequisites
        // are all mastered. For each node encountered we call `evaluate` on
        // that node to allow the normal backward traversal to run (so we
        // properly surface ZPD candidates or remediation). If a successor
        // is itself auto-mastered, we continue to its dependents.
        const startSuccs = dependents.get(indicatorId) ?? [];
        const queue: string[] = [];
        for (const sid of startSuccs) {
          const sInd = indicatorById.get(sid);
          if (!sInd) continue;
          // only enqueue successors whose prerequisites are all mastered
          let allMastered = true;
          for (const pre of sInd.prerequisites) {
            const preNode = indicatorById.get(pre);
            if (!preNode) {
              allMastered = false;
              break;
            }
            const preProb =
              logistic(
                blendAbility(preNode, request.abilities, weights) -
                  preNode.difficulty
              ) ?? 0;
            if (preProb < masteredThreshold) {
              allMastered = false;
              break;
            }
          }
          if (allMastered) queue.push(sid);
        }

        while (queue.length > 0) {
          const current = queue.shift()!;
          // Use evaluate to apply normal backward-checking logic from this
          // successor. Pass the updated trail so traversed path is accurate.
          const result = evaluate(current, updatedTrail);
          if (result.status === "recommended" || result.status === "needs-remediation") {
            // Found an actionable recommendation.
            return result;
          }
          if (result.status === "auto-mastered") {
            // If this successor appears mastered, continue forward by
            // enqueueing its dependents whose prerequisites are all mastered.
            const nextSuccs = dependents.get(current) ?? [];
            for (const ns of nextSuccs) {
              const nsInd = indicatorById.get(ns);
              if (!nsInd) continue;
              let allMasteredNs = true;
              for (const pre of nsInd.prerequisites) {
                const preNode = indicatorById.get(pre);
                if (!preNode) {
                  allMasteredNs = false;
                  break;
                }
                const preProb =
                  logistic(
                    blendAbility(preNode, request.abilities, weights) -
                      preNode.difficulty
                  ) ?? 0;
                if (preProb < masteredThreshold) {
                  allMasteredNs = false;
                  break;
                }
              }
              if (allMasteredNs && !visited.has(ns)) {
                queue.push(ns);
              }
            }
          }
          // otherwise continue with next queued successor
        }
        // If BFS over fully-mastered-successors didn't surface an actionable
        // candidate, we may still want to consider direct successors as a
        // fallback — but only in the specific case where the current node
        // is the *start* indicator (first node) and is the requested
        // target. This preserves the invariant that we don't advance to
        // successors until their prerequisites are mastered except for the
        // special bootstrapping case of the start node.
        const directSuccs = dependents.get(indicatorId) ?? [];
        const allowDirectFallback =
          indicatorId === request.targetIndicatorId &&
          request.graph &&
          (request.graph as any).startIndicatorId === indicatorId;
        if (directSuccs.length > 0 && allowDirectFallback) {
          let bestInZPD: { id: string; prob: number; delta: number } | null = null;
          let bestByProb: { id: string; prob: number } | null = null;
          for (const sid of directSuccs) {
            const sInd = indicatorById.get(sid);
            if (!sInd) continue;
            const sProb =
              logistic(
                blendAbility(sInd, request.abilities, weights) - sInd.difficulty
              ) ?? 0;
            if (sProb >= zpdMin && sProb <= zpdMax) {
              const delta = Math.abs(sProb - masteredThreshold);
              if (!bestInZPD || delta < bestInZPD.delta) {
                bestInZPD = { id: sid, prob: sProb, delta };
              }
            }
            if (!bestByProb || sProb > bestByProb.prob) {
              bestByProb = { id: sid, prob: sProb };
            }
          }

          const chosenId = bestInZPD ? bestInZPD.id : bestByProb ? bestByProb.id : null;
          if (chosenId && !visited.has(chosenId)) {
            const forwardResult = evaluate(chosenId, updatedTrail);
            if (forwardResult.status !== "no-candidate") {
              return forwardResult;
            }
          }
        }
      }

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

    // If we couldn't find any candidate in the prerequisites or self, but
    // recorded a nearest non-mastered prerequisite above, return that as a
    // remediation suggestion instead of a generic `no-candidate` result.
    if (fallbackRemediation) {
      return fallbackRemediation;
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
