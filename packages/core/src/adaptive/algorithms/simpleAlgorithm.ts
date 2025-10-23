import type { AlgorithmContext, AlgorithmResult, RecommendationAlgorithm } from "./types";

export class SimpleMasteryAlgorithm implements RecommendationAlgorithm {
  public readonly id = "simple";
  public readonly title = "Simple Mastery Weighted";

  public score({ indicator, masteryMap }: AlgorithmContext): AlgorithmResult {
    const mastery = masteryMap.get(indicator.indicator.id) ?? 0;
    const score = (1 - mastery) * indicator.indicator.weight;
    return {
      mastery,
      score,
      reason: `Mastery at ${(mastery * 100).toFixed(0)}%`
    };
  }
}
