import {
  buildIndicatorGraph,
  findBlockedBy,
  topologicalSort,
  type IndicatorGraph,
  type IndicatorContext
} from "../domain/learningGraph";
import type { Grade, LearnerProfile, Recommendation } from "../domain/models";
import { SimpleMasteryAlgorithm } from "./algorithms";
import type { RecommendationAlgorithm, AlgorithmContext } from "./algorithms";

export interface RecommendationOptions {
  limit?: number;
  prerequisiteThreshold?: number;
  allowBlocked?: boolean;
}

export interface AdaptiveEngineOptions {
  algorithm?: RecommendationAlgorithm;
}

export class AdaptiveEngine {
  private grades: Grade[];
  private graph: IndicatorGraph;
  private sortedIds: string[];
  private algorithm: RecommendationAlgorithm;

  constructor(grades: Grade[], options: AdaptiveEngineOptions = {}) {
    this.grades = grades;
    this.graph = buildIndicatorGraph(this.grades);
    this.sortedIds = topologicalSort(this.graph);
    this.algorithm = options.algorithm ?? new SimpleMasteryAlgorithm();
  }

  public setGrades(grades: Grade[]): void {
    this.grades = grades;
    this.graph = buildIndicatorGraph(this.grades);
    this.sortedIds = topologicalSort(this.graph);
  }

  public setAlgorithm(algorithm: RecommendationAlgorithm): void {
    this.algorithm = algorithm;
  }

  public getAlgorithm(): RecommendationAlgorithm {
    return this.algorithm;
  }

  public getRecommendationList(
    learnerProfile: LearnerProfile,
    options: RecommendationOptions = {}
  ): Recommendation[] {
    const { limit = 5, prerequisiteThreshold = 0.7, allowBlocked = false } = options;
    const masteryMap = this.toMasteryMap(learnerProfile);
    const recommendations: Recommendation[] = [];

    const ids = this.sortedIds.length ? this.sortedIds : topologicalSort(this.graph);
    ids.forEach(id => {
      const context = this.graph.indicators.get(id);
      if (!context) {
        return;
      }

      const algorithmContext = this.buildAlgorithmContext({
        context,
        learnerProfile,
        masteryMap
      });
      const result = this.algorithm.score(algorithmContext);
      const mastery = result.mastery;
      const score = result.score;
      const blockedBy = findBlockedBy(id, this.graph, masteryMap, prerequisiteThreshold);

      if (!allowBlocked && blockedBy.length > 0) {
        return;
      }

      recommendations.push({
        outcomeId: context.outcome.id,
        outcomeName: context.outcome.name,
        mastery,
        indicator: context.indicator,
        blockedBy,
        score,
        reason:
          blockedBy.length > 0
            ? `Requires completion of indicators: ${blockedBy.join(", ")}`
            : result.reason
      });
    });

    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private buildAlgorithmContext({
    context,
    learnerProfile,
    masteryMap
  }: {
    context: IndicatorContext;
    learnerProfile: LearnerProfile;
    masteryMap: Map<string, number>;
  }): AlgorithmContext {
    return {
      indicator: context,
      learnerProfile,
      masteryMap
    };
  }

  private toMasteryMap(learnerProfile: LearnerProfile): Map<string, number> {
    const map = new Map<string, number>();
    learnerProfile.indicatorStates.forEach(state => {
      map.set(state.indicatorId, state.mastery);
    });
    return map;
  }
}
