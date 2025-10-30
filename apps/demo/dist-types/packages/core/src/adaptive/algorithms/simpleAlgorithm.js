export class SimpleMasteryAlgorithm {
    constructor() {
        this.id = "simple";
        this.title = "Simple Mastery Weighted";
    }
    score({ indicator, masteryMap }) {
        const mastery = masteryMap.get(indicator.indicator.id) ?? 0;
        const score = (1 - mastery) * indicator.indicator.weight;
        return {
            mastery,
            score,
            reason: `Mastery at ${(mastery * 100).toFixed(0)}%`
        };
    }
    update(_context, _observation, _result) {
        // No stateful updates required for the simple algorithm.
    }
}
