import type {
  AlgorithmContext,
  AlgorithmObservation,
  AlgorithmResult,
  RecommendationAlgorithm
} from "./types";
import { clamp } from "./helpers";

const DEFAULT_LEARNER_RATING = 1200;
const DEFAULT_INDICATOR_RATING = 1200;

export class EloAlgorithm implements RecommendationAlgorithm {
  public readonly id = "elo";
  public readonly title = "Elo Skill Rating";

  public score({ indicator, learnerProfile, masteryMap }: AlgorithmContext): AlgorithmResult {
    const state = learnerProfile.indicatorStates.find(
      s => s.indicatorId === indicator.indicator.id
    );
    const mastery = masteryMap.get(indicator.indicator.id) ?? 0.5;
    const learnerRating =
      state?.eloRating ?? this.estimateEloFromMastery(mastery);
    const indicatorRating =
      this.estimateIndicatorRating(indicator.indicator.difficulty) ??
      DEFAULT_INDICATOR_RATING;

    const expected = 1 / (1 + Math.pow(10, (indicatorRating - learnerRating) / 400));
    const masteryEstimate = clamp(expected);
    const score = (1 - masteryEstimate) * indicator.indicator.weight;

    return {
      mastery: masteryEstimate,
      score,
      reason: `Elo expected mastery ${(masteryEstimate * 100).toFixed(0)}% (R=${learnerRating.toFixed(
        0
      )})`
    };
  }

  private estimateEloFromMastery(mastery: number): number {
    return DEFAULT_LEARNER_RATING + (mastery - 0.5) * 800;
  }

  private estimateIndicatorRating(difficulty?: number): number | undefined {
    if (difficulty === undefined) {
      return undefined;
    }
    return DEFAULT_INDICATOR_RATING + difficulty * 200;
  }

  public update(
    _context: AlgorithmContext,
    _observation: AlgorithmObservation,
    _result: AlgorithmResult
  ): void {
    // Traditional Elo updates would adjust ratings; this algorithm leaves persistence to other systems.
  }
}
