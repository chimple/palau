import { buildIndicatorGraph, findBlockedBy, topologicalSort } from "../domain/learningGraph";
import { SimpleMasteryAlgorithm } from "./algorithms";
export class AdaptiveEngine {
    constructor(grades, options = {}) {
        this.grades = grades;
        this.graph = buildIndicatorGraph(this.grades);
        this.sortedIds = topologicalSort(this.graph);
        this.algorithm = options.algorithm ?? new SimpleMasteryAlgorithm();
    }
    setGrades(grades) {
        this.grades = grades;
        this.graph = buildIndicatorGraph(this.grades);
        this.sortedIds = topologicalSort(this.graph);
    }
    setAlgorithm(algorithm) {
        this.algorithm = algorithm;
    }
    getAlgorithm() {
        return this.algorithm;
    }
    getRecommendationList(learnerProfile, options = {}) {
        const { limit = 5, prerequisiteThreshold = 0.7, allowBlocked = false } = options;
        const masteryMap = this.toMasteryMap(learnerProfile);
        const abilities = this.toAbilityMaps(learnerProfile);
        const recommendations = [];
        const ids = this.sortedIds.length ? this.sortedIds : topologicalSort(this.graph);
        ids.forEach(id => {
            const context = this.graph.indicators.get(id);
            if (!context) {
                return;
            }
            const algorithmContext = this.buildAlgorithmContext({
                context,
                learnerProfile,
                masteryMap,
                abilities
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
                reason: blockedBy.length > 0
                    ? `Requires completion of indicators: ${blockedBy.join(", ")}`
                    : result.reason
            });
        });
        return recommendations
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
    buildAlgorithmContext({ context, learnerProfile, masteryMap, abilities }) {
        return {
            indicator: context,
            learnerProfile,
            masteryMap,
            graph: this.graph,
            abilities
        };
    }
    toMasteryMap(learnerProfile) {
        const map = new Map();
        learnerProfile.indicatorStates.forEach(state => {
            map.set(state.indicatorId, state.mastery);
        });
        return map;
    }
    toAbilityMaps(learnerProfile) {
        const indicatorMap = new Map();
        learnerProfile.indicatorStates.forEach(state => {
            indicatorMap.set(state.indicatorId, state.mastery ?? 0);
        });
        const hasIndicatorMastery = Array.from(indicatorMap.values()).some(value => value > 0);
        const outcomeMap = new Map();
        if (!hasIndicatorMastery) {
            learnerProfile.outcomeAbilities?.forEach(ability => {
                outcomeMap.set(ability.outcomeId, ability.mastery ?? 0);
            });
        }
        const competencyMap = new Map();
        if (!hasIndicatorMastery) {
            learnerProfile.competencyAbilities?.forEach(ability => {
                competencyMap.set(ability.competencyId, ability.mastery ?? 0);
            });
        }
        const gradeMap = new Map();
        if (!hasIndicatorMastery) {
            learnerProfile.gradeAbilities?.forEach(ability => {
                gradeMap.set(ability.gradeId, ability.mastery ?? 0);
            });
        }
        if (!gradeMap.has(learnerProfile.gradeId)) {
            gradeMap.set(learnerProfile.gradeId, 0);
        }
        return {
            indicators: indicatorMap,
            outcomes: outcomeMap,
            competencies: competencyMap,
            grades: gradeMap
        };
    }
}
