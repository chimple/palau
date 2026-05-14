import {
  DEFAULT_BLEND_WEIGHTS,
  DEFAULT_MASTERED_THRESHOLD,
  DEFAULT_ZPD_RANGE,
} from "./constants";
import type {
  AbilityState,
  BlendWeights,
  DependencyGraph,
  RecommendationContext,
  RecommendationRequest,
} from "./types";
import { blendAbility, indexGraphByIndicator, logistic } from "./utils";

export type EvalCheckStatus = "pass" | "fail" | "warn";

export interface EvalCheck {
  id: string;
  status: EvalCheckStatus;
  message: string;
}

export interface RecommendationEvalResult {
  ok: boolean;
  checks: EvalCheck[];
  metrics: {
    candidateProbability: number;
    candidateInZpd: boolean;
    candidateMastered: boolean;
    candidateInPrereqClosure: boolean;
    candidateInForward: boolean;
    zpdCandidatesBackward: number;
    zpdCandidatesForward: number;
  };
}

export interface RecommendationEvalRequest extends RecommendationRequest {
  recommendation: RecommendationContext;
}

const isMastered = (probability: number, masteredThreshold: number) =>
  probability >= masteredThreshold;

const isInZpd = (probability: number, zpdRange: [number, number]) =>
  probability >= zpdRange[0] && probability <= zpdRange[1];

const computeProbability = (
  indicatorId: string,
  graph: DependencyGraph,
  abilities: AbilityState,
  weights: BlendWeights
): number => {
  const indicator = graph.indicators.find((item) => item.id === indicatorId);
  if (!indicator) {
    return 0;
  }
  return (
    logistic(blendAbility(indicator, abilities, weights) - indicator.difficulty) ??
    0
  );
};

const computePrereqClosure = (
  graph: DependencyGraph,
  startId: string
): Set<string> => {
  const { indicatorById } = indexGraphByIndicator(graph);
  const closure = new Set<string>();
  const stack = [startId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const indicator = indicatorById.get(current);
    if (!indicator) {
      continue;
    }
    for (const prereq of indicator.prerequisites) {
      if (!closure.has(prereq)) {
        closure.add(prereq);
        stack.push(prereq);
      }
    }
  }
  return closure;
};

const computeForwardCandidates = (
  graph: DependencyGraph,
  abilities: AbilityState,
  weights: BlendWeights,
  masteredThreshold: number,
  targetId: string
): Set<string> => {
  const { indicatorById, dependents } = indexGraphByIndicator(graph);
  const forward = new Set<string>();
  const queue: string[] = [];
  const start = dependents.get(targetId) ?? [];
  for (const id of start) {
    queue.push(id);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (forward.has(current)) {
      continue;
    }
    const indicator = indicatorById.get(current);
    if (!indicator) {
      continue;
    }
    let allMastered = true;
    for (const prereq of indicator.prerequisites) {
      const prereqIndicator = indicatorById.get(prereq);
      if (!prereqIndicator) {
        allMastered = false;
        break;
      }
      const prob =
        logistic(
          blendAbility(prereqIndicator, abilities, weights) -
            prereqIndicator.difficulty
        ) ?? 0;
      if (!isMastered(prob, masteredThreshold)) {
        allMastered = false;
        break;
      }
    }
    if (!allMastered) {
      continue;
    }
    forward.add(current);
    const next = dependents.get(current) ?? [];
    for (const nextId of next) {
      if (!forward.has(nextId)) {
        queue.push(nextId);
      }
    }
  }
  return forward;
};

export const evaluateRecommendation = (
  request: RecommendationEvalRequest
): RecommendationEvalResult => {
  const weights = request.blendWeights ?? DEFAULT_BLEND_WEIGHTS;
  const zpdRange = request.zpdRange ?? DEFAULT_ZPD_RANGE;
  const masteredThreshold =
    request.masteredThreshold ?? DEFAULT_MASTERED_THRESHOLD;
  const { graph, abilities, targetIndicatorId, recommendation } = request;
  const { indicatorById } = indexGraphByIndicator(graph);

  const checks: EvalCheck[] = [];
  const candidateId = recommendation.candidateId;
  const candidateIndicator = indicatorById.get(candidateId);

  if (!candidateIndicator) {
    checks.push({
      id: "candidate-exists",
      status: "fail",
      message: "Recommended indicator is not present in the graph.",
    });
  }

  const candidateProbability = computeProbability(
    candidateId,
    graph,
    abilities,
    weights
  );
  const candidateInZpd = isInZpd(candidateProbability, zpdRange);
  const candidateMastered = isMastered(candidateProbability, masteredThreshold);

  const prereqClosure = computePrereqClosure(graph, targetIndicatorId);
  const candidateInPrereqClosure = prereqClosure.has(candidateId);

  const targetProbability = computeProbability(
    targetIndicatorId,
    graph,
    abilities,
    weights
  );
  const targetMastered = isMastered(targetProbability, masteredThreshold);
  const forwardCandidates = targetMastered
    ? computeForwardCandidates(
        graph,
        abilities,
        weights,
        masteredThreshold,
        targetIndicatorId
      )
    : new Set<string>();
  const candidateInForward = forwardCandidates.has(candidateId);

  const zpdCandidatesBackward = Array.from(
    new Set([targetIndicatorId, ...prereqClosure])
  ).filter((id) =>
    isInZpd(computeProbability(id, graph, abilities, weights), zpdRange)
  ).length;
  const zpdCandidatesForward = Array.from(forwardCandidates).filter((id) =>
    isInZpd(computeProbability(id, graph, abilities, weights), zpdRange)
  ).length;

  if (
    candidateId !== targetIndicatorId &&
    !candidateInPrereqClosure &&
    !candidateInForward
  ) {
    checks.push({
      id: "path-integrity",
      status: "fail",
      message:
        "Recommended indicator is not in the target prerequisite chain or a valid successor.",
    });
  }

  if (recommendation.status === "recommended" && !candidateInZpd) {
    checks.push({
      id: "zpd-alignment",
      status: "fail",
      message: "Recommendation marked as ZPD but probability is outside ZPD.",
    });
  }

  if (
    recommendation.status !== "recommended" &&
    (zpdCandidatesBackward > 0 || zpdCandidatesForward > 0)
  ) {
    checks.push({
      id: "missed-zpd",
      status: "fail",
      message:
        "A ZPD candidate exists but the recommendation did not select it.",
    });
  }

  if (recommendation.status === "auto-mastered" && !candidateMastered) {
    checks.push({
      id: "auto-mastered-consistency",
      status: "fail",
      message:
        "Recommendation marked auto-mastered but candidate is not mastered.",
    });
  }

  if (recommendation.status === "needs-remediation" && candidateInZpd) {
    checks.push({
      id: "remediation-consistency",
      status: "fail",
      message:
        "Recommendation marked remediation but candidate is already in ZPD.",
    });
  }

  if (candidateIndicator && checks.every((check) => check.id !== "candidate-exists")) {
    checks.push({
      id: "candidate-exists",
      status: "pass",
      message: "Recommended indicator exists in the graph.",
    });
  }

  const ok = checks.every((check) => check.status !== "fail");

  return {
    ok,
    checks,
    metrics: {
      candidateProbability,
      candidateInZpd,
      candidateMastered,
      candidateInPrereqClosure,
      candidateInForward,
      zpdCandidatesBackward,
      zpdCandidatesForward,
    },
  };
};
