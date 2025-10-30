import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from "react";
import { IndicatorProgress, IRTAlgorithm, EloAlgorithm, SimpleMasteryAlgorithm, BayesianKnowledgeTracingAlgorithm, ModifiedEloAlgorithm, buildIndicatorGraph, toOutcomeSeries, useLearningPath } from "@chimple/palau-core";
import { OutcomeChart } from "./components/OutcomeChart";
import { RecommendationList } from "./components/RecommendationList";
import { IndicatorDependencyGraph } from "./components/IndicatorDependencyGraph";
import { sampleGrades, sampleLearnerProfile } from "./mock/sampleData";
const grades = sampleGrades;
const computeAggregatedThetas = (indicatorStates, gradeData) => {
    const indicatorMastery = new Map();
    indicatorStates.forEach(state => {
        indicatorMastery.set(state.indicatorId, state.mastery ?? 0);
    });
    const outcomeAbilities = new Map();
    const competencyAbilities = new Map();
    const gradeAbilities = new Map();
    gradeData.forEach(grade => {
        let gradeSum = 0;
        let gradeCount = 0;
        grade.subjects.forEach(subject => {
            subject.competencies.forEach(competency => {
                let competencySum = 0;
                let competencyCount = 0;
                competency.outcomes.forEach(outcome => {
                    let outcomeSum = 0;
                    let outcomeCount = 0;
                    outcome.indicators.forEach(indicator => {
                        const masteryValue = indicatorMastery.get(indicator.id);
                        if (masteryValue !== undefined) {
                            outcomeSum += masteryValue;
                            outcomeCount += 1;
                        }
                    });
                    const outcomeMastery = outcomeCount ? outcomeSum / outcomeCount : 0;
                    outcomeAbilities.set(outcome.id, outcomeMastery);
                    competencySum += outcomeMastery;
                    competencyCount += 1;
                });
                const competencyMastery = competencyCount ? competencySum / competencyCount : 0;
                competencyAbilities.set(competency.id, competencyMastery);
                gradeSum += competencyMastery;
                gradeCount += 1;
            });
        });
        const gradeMastery = gradeCount ? gradeSum / gradeCount : 0;
        gradeAbilities.set(grade.id, gradeMastery);
    });
    const mapToArray = (map, mapFn) => Array.from(map.entries()).map(([id, mastery]) => mapFn(id, mastery));
    return {
        outcomeAbilities: mapToArray(outcomeAbilities, (outcomeId, mastery) => ({ outcomeId, mastery })),
        competencyAbilities: mapToArray(competencyAbilities, (competencyId, mastery) => ({ competencyId, mastery })),
        gradeAbilities: mapToArray(gradeAbilities, (gradeId, mastery) => ({ gradeId, mastery }))
    };
};
const buildAbilityMapsFromProfile = (profile) => {
    const indicatorMap = new Map();
    profile.indicatorStates.forEach(state => {
        indicatorMap.set(state.indicatorId, state.mastery ?? 0);
    });
    const hasIndicatorMastery = Array.from(indicatorMap.values()).some(value => value > 0);
    const outcomeMap = new Map();
    if (!hasIndicatorMastery) {
        profile.outcomeAbilities?.forEach(ability => {
            outcomeMap.set(ability.outcomeId, ability.mastery ?? 0);
        });
    }
    const competencyMap = new Map();
    if (!hasIndicatorMastery) {
        profile.competencyAbilities?.forEach(ability => {
            competencyMap.set(ability.competencyId, ability.mastery ?? 0);
        });
    }
    const gradeMap = new Map();
    if (!hasIndicatorMastery) {
        profile.gradeAbilities?.forEach(ability => {
            gradeMap.set(ability.gradeId, ability.mastery ?? 0);
        });
    }
    if (!gradeMap.has(profile.gradeId)) {
        gradeMap.set(profile.gradeId, 0);
    }
    return {
        indicators: indicatorMap,
        outcomes: outcomeMap,
        competencies: competencyMap,
        grades: gradeMap
    };
};
const App = () => {
    const [profile, setProfile] = useState(() => ({
        ...sampleLearnerProfile,
        indicatorStates: sampleLearnerProfile.indicatorStates.map(state => ({ ...state })),
        outcomeAbilities: sampleLearnerProfile.outcomeAbilities.map(ability => ({ ...ability })),
        competencyAbilities: sampleLearnerProfile.competencyAbilities.map(ability => ({ ...ability })),
        gradeAbilities: sampleLearnerProfile.gradeAbilities.map(ability => ({ ...ability }))
    }));
    const [algorithmId, setAlgorithmId] = useState("simple");
    const [view, setView] = useState("insights");
    const graph = useMemo(() => buildIndicatorGraph(grades), [grades]);
    const algorithm = useMemo(() => {
        switch (algorithmId) {
            case "irt":
                return new IRTAlgorithm();
            case "elo":
                return new EloAlgorithm();
            case "bkt":
                return new BayesianKnowledgeTracingAlgorithm();
            case "modified-elo":
                return new ModifiedEloAlgorithm();
            case "simple":
            default:
                return new SimpleMasteryAlgorithm();
        }
    }, [algorithmId]);
    const handleSubmitScore = useCallback((indicatorId, score) => {
        const clampedScore = Math.max(0, Math.min(1, score));
        setProfile(prev => {
            const clonedProfile = {
                ...prev,
                indicatorStates: prev.indicatorStates.map(state => ({ ...state })),
                outcomeAbilities: prev.outcomeAbilities.map(ability => ({ ...ability })),
                competencyAbilities: prev.competencyAbilities.map(ability => ({ ...ability })),
                gradeAbilities: prev.gradeAbilities.map(ability => ({ ...ability })),
                preferences: prev.preferences ? { ...prev.preferences } : prev.preferences
            };
            const indicatorContext = graph.indicators.get(indicatorId);
            if (!indicatorContext) {
                return prev;
            }
            const preAggregated = computeAggregatedThetas(clonedProfile.indicatorStates, grades);
            clonedProfile.outcomeAbilities = preAggregated.outcomeAbilities;
            clonedProfile.competencyAbilities = preAggregated.competencyAbilities;
            clonedProfile.gradeAbilities = preAggregated.gradeAbilities;
            const masteryMap = new Map();
            clonedProfile.indicatorStates.forEach(state => {
                masteryMap.set(state.indicatorId, state.mastery);
            });
            const abilities = buildAbilityMapsFromProfile(clonedProfile);
            const algorithmContext = {
                indicator: indicatorContext,
                learnerProfile: clonedProfile,
                masteryMap,
                graph,
                abilities
            };
            const observation = {
                indicatorId,
                score: clampedScore
            };
            const result = algorithm.score(algorithmContext);
            if (typeof algorithm.update === "function") {
                algorithm.update(algorithmContext, observation, result);
            }
            else {
                const state = clonedProfile.indicatorStates.find(entry => entry.indicatorId === indicatorId);
                if (state) {
                    state.mastery = clampedScore;
                }
                else {
                    clonedProfile.indicatorStates.push({
                        indicatorId,
                        mastery: clampedScore
                    });
                }
            }
            const aggregated = computeAggregatedThetas(clonedProfile.indicatorStates, grades);
            clonedProfile.outcomeAbilities = aggregated.outcomeAbilities;
            clonedProfile.competencyAbilities = aggregated.competencyAbilities;
            clonedProfile.gradeAbilities = aggregated.gradeAbilities;
            return clonedProfile;
        });
    }, [algorithm, grades, graph]);
    const { recommendations } = useLearningPath({
        grades,
        learnerProfile: profile,
        options: {
            limit: 6,
            allowBlocked: false
        },
        algorithm
    });
    const series = useMemo(() => toOutcomeSeries(recommendations), [recommendations]);
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("header", { children: [_jsx("h1", { children: "Palau Adaptive Learning Demo" }), _jsx("p", { children: "This interactive demo showcases personalised recommendations driven by the Palau core engine. Explore the suggested learning indicators and how they map to learning outcomes." }), _jsx("div", { className: "control-row", children: _jsxs("label", { htmlFor: "algorithm", children: ["Algorithm", _jsxs("select", { id: "algorithm", value: algorithmId, onChange: event => setAlgorithmId(event.target.value), children: [_jsx("option", { value: "simple", children: "Simple Mastery Weighted" }), _jsx("option", { value: "irt", children: "Item Response Theory" }), _jsx("option", { value: "elo", children: "Elo Skill Rating" }), _jsx("option", { value: "bkt", children: "Bayesian Knowledge Tracing" }), _jsx("option", { value: "modified-elo", children: "Modified Elo (ZPD)" })] })] }) })] }), _jsxs("nav", { className: "tabs", children: [_jsx("button", { type: "button", className: view === "insights" ? "active" : "", onClick: () => setView("insights"), children: "Insights" }), _jsx("button", { type: "button", className: view === "graph" ? "active" : "", onClick: () => setView("graph"), children: "Dependency Graph" })] }), view === "insights" ? (_jsxs("main", { className: "grid", children: [_jsxs("section", { children: [_jsx("h2", { children: "Recommended Indicators" }), _jsx(RecommendationList, { recommendations: recommendations, renderItem: rec => (_jsx(IndicatorProgress, { recommendation: rec }, rec.indicator.id)) })] }), _jsxs("section", { children: [_jsx("h2", { children: "Learning Outcome Progress" }), _jsx(OutcomeChart, { series: series })] })] })) : (_jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Learning Indicator Dependency Graph" }), _jsx("p", { className: "panel-hint", children: "Nodes represent learning indicators, arrows point to the indicators they unlock. Use the controls to explore the prerequisite flow." }), _jsx(IndicatorDependencyGraph, { grades: grades, learnerProfile: profile, recommendations: recommendations, onSubmitScore: handleSubmitScore })] }))] }));
};
export default App;
