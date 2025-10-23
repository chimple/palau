import type { AlgorithmContext, AlgorithmResult, RecommendationAlgorithm } from "./types";
import { clamp, logistic } from "./helpers";

const DEFAULT_A = 1.0;
const DEFAULT_B = 0;
const DEFAULT_C = 0.2;

export class IRTAlgorithm implements RecommendationAlgorithm {
  public readonly id = "irt";
  public readonly title = "Item Response Theory";

  public score({ indicator, masteryMap }: AlgorithmContext): AlgorithmResult {
    const stateMastery = masteryMap.get(indicator.indicator.id) ?? 0.5;
    const theta = this.toTheta(stateMastery);
    const a = indicator.indicator.discrimination ?? DEFAULT_A;
    const b = indicator.indicator.difficulty ?? DEFAULT_B;
    const c = indicator.indicator.guessing ?? DEFAULT_C;

    const probability = c + (1 - c) * logistic(a * (theta - b));
    const mastery = clamp(probability);
    const score = (1 - mastery) * indicator.indicator.weight;

    return {
      mastery,
      score,
      reason: `IRT expected success ${(mastery * 100).toFixed(0)}% (θ=${theta.toFixed(2)})`
    };
  }

  private toTheta(mastery: number): number {
    const epsilon = 1e-3;
    const bounded = clamp(mastery, epsilon, 1 - epsilon);
    return Math.log(bounded / (1 - bounded));
  }
}
