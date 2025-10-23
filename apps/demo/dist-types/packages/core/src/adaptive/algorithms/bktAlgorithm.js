import { clamp } from "./helpers";
const DEFAULT_PRIOR = 0.4;
const DEFAULT_GUESS = 0.2;
const DEFAULT_SLIP = 0.1;
export class BayesianKnowledgeTracingAlgorithm {
    constructor() {
        this.id = "bkt";
        this.title = "Bayesian Knowledge Tracing";
    }
    score({ indicator, learnerProfile, masteryMap }) {
        const state = learnerProfile.indicatorStates.find(s => s.indicatorId === indicator.indicator.id);
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
