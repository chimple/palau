import { AdaptiveEngine, type RecommendationOptions } from "../adaptive/adaptiveEngine";
import type { Grade, LearnerProfile, Recommendation } from "../domain/models";
import type { RecommendationAlgorithm } from "../adaptive/algorithms";

export interface PersonalizationSnapshot {
  recommendations: Recommendation[];
  generatedAt: string;
}

export class PersonalizationService {
  private engine: AdaptiveEngine;

  constructor(grades: Grade[], algorithm?: RecommendationAlgorithm) {
    this.engine = new AdaptiveEngine(grades, { algorithm });
  }

  public updateGrades(grades: Grade[]): void {
    this.engine.setGrades(grades);
  }

  public setAlgorithm(algorithm: RecommendationAlgorithm): void {
    this.engine.setAlgorithm(algorithm);
  }

  public generateSnapshot(
    learnerProfile: LearnerProfile,
    options?: RecommendationOptions
  ): PersonalizationSnapshot {
    const recommendations = this.engine.getRecommendationList(learnerProfile, options);
    return {
      recommendations,
      generatedAt: new Date().toISOString()
    };
  }
}
