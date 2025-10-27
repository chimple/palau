import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { IndicatorProgress, IRTAlgorithm, EloAlgorithm, SimpleMasteryAlgorithm, BayesianKnowledgeTracingAlgorithm, toOutcomeSeries, useLearningPath } from "@chimple/palau-core";
import { OutcomeChart } from "./components/OutcomeChart";
import { RecommendationList } from "./components/RecommendationList";
import { IndicatorDependencyGraph } from "./components/IndicatorDependencyGraph";
import { sampleGrades, sampleLearnerProfile } from "./mock/sampleData";
const grades = sampleGrades;
const learnerProfile = sampleLearnerProfile;
const App = () => {
    const [algorithmId, setAlgorithmId] = useState("simple");
    const [view, setView] = useState("insights");
    const algorithm = useMemo(() => {
        switch (algorithmId) {
            case "irt":
                return new IRTAlgorithm();
            case "elo":
                return new EloAlgorithm();
            case "bkt":
                return new BayesianKnowledgeTracingAlgorithm();
            case "simple":
            default:
                return new SimpleMasteryAlgorithm();
        }
    }, [algorithmId]);
    const { recommendations } = useLearningPath({
        grades,
        learnerProfile,
        options: {
            limit: 6,
            allowBlocked: true
        },
        algorithm
    });
    const series = useMemo(() => toOutcomeSeries(recommendations), [recommendations]);
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("header", { children: [_jsx("h1", { children: "Palau Adaptive Learning Demo" }), _jsx("p", { children: "This interactive demo showcases personalised recommendations driven by the Palau core engine. Explore the suggested learning indicators and how they map to learning outcomes." }), _jsx("div", { className: "control-row", children: _jsxs("label", { htmlFor: "algorithm", children: ["Algorithm", _jsxs("select", { id: "algorithm", value: algorithmId, onChange: event => setAlgorithmId(event.target.value), children: [_jsx("option", { value: "simple", children: "Simple Mastery Weighted" }), _jsx("option", { value: "irt", children: "Item Response Theory" }), _jsx("option", { value: "elo", children: "Elo Skill Rating" }), _jsx("option", { value: "bkt", children: "Bayesian Knowledge Tracing" })] })] }) })] }), _jsxs("nav", { className: "tabs", children: [_jsx("button", { type: "button", className: view === "insights" ? "active" : "", onClick: () => setView("insights"), children: "Insights" }), _jsx("button", { type: "button", className: view === "graph" ? "active" : "", onClick: () => setView("graph"), children: "Dependency Graph" })] }), view === "insights" ? (_jsxs("main", { className: "grid", children: [_jsxs("section", { children: [_jsx("h2", { children: "Recommended Indicators" }), _jsx(RecommendationList, { recommendations: recommendations, renderItem: rec => (_jsx(IndicatorProgress, { recommendation: rec }, rec.indicator.id)) })] }), _jsxs("section", { children: [_jsx("h2", { children: "Learning Outcome Progress" }), _jsx(OutcomeChart, { series: series })] })] })) : (_jsxs("section", { className: "panel", children: [_jsx("h2", { children: "Learning Indicator Dependency Graph" }), _jsx("p", { className: "panel-hint", children: "Nodes represent learning indicators, arrows point to the indicators they unlock. Use the controls to explore the prerequisite flow." }), _jsx(IndicatorDependencyGraph, { grades: grades })] }))] }));
};
export default App;
