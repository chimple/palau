import { AdaptiveEngine } from "../adaptive/adaptiveEngine";
export class PersonalizationService {
    constructor(grades, algorithm) {
        this.engine = new AdaptiveEngine(grades, { algorithm });
    }
    updateGrades(grades) {
        this.engine.setGrades(grades);
    }
    setAlgorithm(algorithm) {
        this.engine.setAlgorithm(algorithm);
    }
    generateSnapshot(learnerProfile, options) {
        const recommendations = this.engine.getRecommendationList(learnerProfile, options);
        return {
            recommendations,
            generatedAt: new Date().toISOString()
        };
    }
}
