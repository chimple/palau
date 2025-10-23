import type { AlgorithmContext, AlgorithmResult, RecommendationAlgorithm } from "./types";
import { clamp } from "./helpers";

const DEFAULT_PRIOR = 0.4;
const DEFAULT_GUESS = 0.2;
const DEFAULT_SLIP = 0.1;

export class BayesianKnowledgeTracingAlgorithm implements RecommendationAlgorithm {
  public readonly id = "bkt";
  public readonly title = "Bayesian Knowledge Tracing";

  public score({ indicator, learnerProfile, masteryMap }: AlgorithmContext): AlgorithmResult {
    const state = learnerProfile.indicatorStates.find(
      s => s.indicatorId === indicator.indicator.id
    );
    const prior = state?.probabilityKnown ?? masteryMap.get(indicator.indicator.id) ?? DEFAULT_PRIOR;
    const guess = indicator.indicator.guessing ?? DEFAULT_GUESS;
    const slip = indicator.indicator.slip ?? DEFAULT_SLIP;

    const mastery = clamp(prior * (1 - slip) + (1 - prior) * guess);
    const score = (1 - mastery) * indicator.indicator.weight;

    return {
      mastery,
      score,
      reason: `BKT expected correctness ${(mastery * 100).toFixed(0)}%`
    };
  }
}
