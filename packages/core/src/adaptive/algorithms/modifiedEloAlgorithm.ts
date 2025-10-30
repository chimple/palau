import type {
  AlgorithmContext,
  AlgorithmObservation,
  AlgorithmResult,
  RecommendationAlgorithm
} from "./types";
import { clamp, logistic } from "./helpers";

interface ProbabilityCandidate {
  id: string;
  probability: number;
}

export class ModifiedEloAlgorithm implements RecommendationAlgorithm {
  public readonly id = "modified-elo";
  public readonly title = "Modified Elo with ZPD";

  private readonly zpdLower = 0.5;
  private readonly zpdUpper = 0.8;
  private readonly tooHardThreshold = 0.4;
  private readonly passportThreshold = 0.8;
  private readonly scale = 1;

  private readonly abilityWeights = {
    indicator: 0.45,
    outcome: 0.35,
    competency: 0.15,
    grade: 0.05
  };

  private readonly learningRates = {
    indicator: 0.18,
    outcome: 0.12,
    competency: 0.08,
    grade: 0.05
  };

  public score(context: AlgorithmContext): AlgorithmResult {
    const { indicator, abilities, masteryMap, graph } = context;
    const indicatorId = indicator.indicator.id;
    const probability = this.estimateProbability(indicator, abilities);
    const mastery = clamp(probability);
    const unmetPrerequisites = this.collectPrerequisites(indicatorId, graph).filter(
      prereqId => !this.hasPassport(prereqId, graph, abilities, masteryMap)
    );

    if (unmetPrerequisites.length > 0) {
      const candidate = this.findZpdCandidate(unmetPrerequisites, context);
      if (candidate) {
        const closeness = this.zpdCloseness(candidate.probability);
        const score = closeness * indicator.indicator.weight * 0.9;
        return {
          mastery,
          probability,
          score: clamp(score),
          focusIndicatorId: candidate.id,
          reason: `Prerequisite ${candidate.id} is in ZPD (${(candidate.probability * 100).toFixed(
            0
          )}%). Reinforce before attempting ${indicatorId}.`
        };
      }

      return {
        mastery,
        probability,
        score: 0,
        focusIndicatorId: unmetPrerequisites[0],
        reason: `Prerequisites for ${indicatorId} fall outside the ZPD. Backtrack for remediation.`
      };
    }

    let score: number;
    let reason: string;

    if (this.isWithinZpd(probability)) {
      const closeness = this.zpdCloseness(probability);
      score = closeness * indicator.indicator.weight;
      reason = `Indicator ${indicatorId} sits in ZPD (${(probability * 100).toFixed(
        0
      )}%). Ideal for practice.`;
    } else if (probability < this.zpdLower) {
      const penalty = this.lowProbabilityPenalty(probability);
      score = penalty * indicator.indicator.weight * 0.6;
      reason = probability < this.tooHardThreshold
        ? `Indicator ${indicatorId} is too hard (${(probability * 100).toFixed(
            0
          )}%). Step back to prerequisites.`
        : `Indicator ${indicatorId} is below ZPD (${(probability * 100).toFixed(
            0
          )}%). Consider easier items.`;
    } else {
      const penalty = this.highProbabilityPenalty(probability);
      score = penalty * indicator.indicator.weight * 0.4;
      reason = `Indicator ${indicatorId} is above ZPD (${(probability * 100).toFixed(
        0
      )}%). Move forward after stamping mastery.`;
    }

    return {
      mastery,
      probability,
      score: clamp(score),
      focusIndicatorId: indicatorId,
      reason
    };
  }

  public update(
    context: AlgorithmContext,
    observation: AlgorithmObservation,
    result: AlgorithmResult
  ): void {
    const { indicator, learnerProfile, abilities } = context;
    const indicatorId = indicator.indicator.id;
    const targetProbability =
      result.probability ?? this.estimateProbability(indicator, abilities);
    const outcomeId = indicator.outcome.id;
    const competencyId = indicator.competencyId;
    const gradeId = indicator.gradeId;
    const observedScore = clamp(observation.score);
    const error = observedScore - targetProbability;

    const updatedIndicatorTheta = clamp(
      this.getAbility(abilities.indicators, indicatorId, result.mastery) +
        this.learningRates.indicator * error
    );
    const updatedOutcomeTheta = clamp(
      this.getAbility(abilities.outcomes, outcomeId, updatedIndicatorTheta) +
        this.learningRates.outcome * error
    );
    const updatedCompetencyTheta = clamp(
      this.getAbility(abilities.competencies, competencyId, updatedOutcomeTheta) +
        this.learningRates.competency * error
    );
    const updatedGradeTheta = clamp(
      this.getAbility(abilities.grades, gradeId, updatedCompetencyTheta) +
        this.learningRates.grade * error
    );

    abilities.indicators.set(indicatorId, updatedIndicatorTheta);
    abilities.outcomes.set(outcomeId, updatedOutcomeTheta);
    abilities.competencies.set(competencyId, updatedCompetencyTheta);
    abilities.grades.set(gradeId, updatedGradeTheta);

    this.upsertIndicatorState(learnerProfile, indicatorId, updatedIndicatorTheta);
    this.upsertOutcomeAbility(learnerProfile, outcomeId, updatedOutcomeTheta);
    this.upsertCompetencyAbility(learnerProfile, competencyId, updatedCompetencyTheta);
    this.upsertGradeAbility(learnerProfile, gradeId, updatedGradeTheta);

    result.mastery = updatedIndicatorTheta;
    result.probability = targetProbability;

    if (updatedIndicatorTheta >= this.passportThreshold) {
      this.upsertIndicatorState(learnerProfile, indicatorId, 1);
    }
  }

  private estimateProbability(context: AlgorithmContext["indicator"], abilities: AlgorithmContext["abilities"]): number {
    const indicatorId = context.indicator.id;
    const thetaIndicator = this.getAbility(abilities.indicators, indicatorId, 0);
    const thetaOutcome = this.getAbility(abilities.outcomes, context.outcome.id, thetaIndicator);
    const thetaCompetency = this.getAbility(abilities.competencies, context.competencyId, thetaOutcome);
    const thetaGrade = this.getAbility(abilities.grades, context.gradeId, thetaCompetency);
    const beta = context.indicator.difficulty ?? 0;
    const blended =
      this.abilityWeights.indicator * thetaIndicator +
      this.abilityWeights.outcome * thetaOutcome +
      this.abilityWeights.competency * thetaCompetency +
      this.abilityWeights.grade * thetaGrade;

    return clamp(logistic((blended - beta) / this.scale));
  }

  private hasPassport(
    indicatorId: string,
    graph: AlgorithmContext["graph"],
    abilities: AlgorithmContext["abilities"],
    masteryMap: Map<string, number>
  ): boolean {
    const context = graph.indicators.get(indicatorId);
    if (context) {
      const probability = this.estimateProbability(context, abilities);
      if (!Number.isNaN(probability)) {
        return probability >= this.passportThreshold;
      }
    }
    const mastery = masteryMap.get(indicatorId);
    return (mastery ?? 0) >= this.passportThreshold;
  }

  private getAbility(map: Map<string, number>, id: string, fallback?: number): number {
    if (map.has(id)) {
      return map.get(id) as number;
    }
    return fallback ?? 0;
  }

  private collectPrerequisites(indicatorId: string, graph: AlgorithmContext["graph"]): string[] {
    const visited = new Set<string>();
    const ordered: string[] = [];
    const queue: string[] = [];
    graph.reverseAdjacency.get(indicatorId)?.forEach(prereq => queue.push(prereq));

    while (queue.length) {
      const current = queue.shift() as string;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      ordered.push(current);
      graph.reverseAdjacency.get(current)?.forEach(parent => {
        if (!visited.has(parent)) {
          queue.push(parent);
        }
      });
    }

    return ordered;
  }

  private findZpdCandidate(
    candidates: string[],
    context: AlgorithmContext
  ): ProbabilityCandidate | undefined {
    for (const candidateId of candidates) {
      const prereqContext = context.graph.indicators.get(candidateId);
      if (!prereqContext) {
        continue;
      }
      const probability = this.estimateProbability(prereqContext, context.abilities);
      if (this.isWithinZpd(probability)) {
        return { id: candidateId, probability };
      }
    }
    return undefined;
  }

  private isWithinZpd(probability: number): boolean {
    return probability >= this.zpdLower && probability <= this.zpdUpper;
  }

  private zpdCloseness(probability: number): number {
    const mid = (this.zpdLower + this.zpdUpper) / 2;
    const halfWindow = (this.zpdUpper - this.zpdLower) / 2;
    return clamp(1 - Math.abs(probability - mid) / halfWindow);
  }

  private lowProbabilityPenalty(probability: number): number {
    return clamp(1 - (this.zpdLower - probability) / this.zpdLower);
  }

  private highProbabilityPenalty(probability: number): number {
    return clamp(1 - (probability - this.zpdUpper) / (1 - this.zpdUpper));
  }

  private upsertIndicatorState(
    profile: AlgorithmContext["learnerProfile"],
    indicatorId: string,
    mastery: number
  ): void {
    const state = profile.indicatorStates.find(s => s.indicatorId === indicatorId);
    if (state) {
      state.mastery = mastery;
    } else {
      profile.indicatorStates.push({
        indicatorId,
        mastery
      });
    }
  }

  private upsertOutcomeAbility(
    profile: AlgorithmContext["learnerProfile"],
    outcomeId: string,
    mastery: number
  ): void {
    const ability = profile.outcomeAbilities.find(item => item.outcomeId === outcomeId);
    if (ability) {
      ability.mastery = mastery;
    } else {
      profile.outcomeAbilities.push({ outcomeId, mastery });
    }
  }

  private upsertCompetencyAbility(
    profile: AlgorithmContext["learnerProfile"],
    competencyId: string,
    mastery: number
  ): void {
    const ability = profile.competencyAbilities.find(item => item.competencyId === competencyId);
    if (ability) {
      ability.mastery = mastery;
    } else {
      profile.competencyAbilities.push({ competencyId, mastery });
    }
  }

  private upsertGradeAbility(
    profile: AlgorithmContext["learnerProfile"],
    gradeId: string,
    mastery: number
  ): void {
    const ability = profile.gradeAbilities.find(item => item.gradeId === gradeId);
    if (ability) {
      ability.mastery = mastery;
    } else {
      profile.gradeAbilities.push({ gradeId, mastery });
    }
  }
}
