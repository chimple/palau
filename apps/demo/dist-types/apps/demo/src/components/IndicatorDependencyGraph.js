import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ReactFlow, { Background, Controls, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import { buildIndicatorGraph, topologicalSort, ModifiedEloAlgorithm } from "@chimple/palau-core";
const columnSpacing = 260;
const rowSpacing = 160;
const duplicateOffset = 160;
const recommendationHighlightPalette = ["#22C55E", "#3B82F6", "#8B5CF6", "#EC4899", "#FACC15"];
const buildCompetencyPlacements = (grades) => {
    const indicatorPlacement = new Map();
    const competencyColumns = [];
    let columnIndex = 0;
    grades.forEach(grade => {
        grade.subjects.forEach(subject => {
            subject.competencies.forEach(competency => {
                const currentColumn = columnIndex++;
                competencyColumns.push({
                    column: currentColumn,
                    competencyName: competency.id
                });
                competency.outcomes.forEach(outcome => {
                    outcome.indicators.forEach(indicator => {
                        indicatorPlacement.set(indicator.id, {
                            column: currentColumn,
                            competencyName: competency.id
                        });
                    });
                });
            });
        });
    });
    return {
        indicatorPlacement,
        competencyColumns
    };
};
const IndicatorNodeLabel = ({ indicatorId, indicatorName, masterySummary, initialScore, probability, difficulty, score, reason, onSubmitScore, highlight }) => {
    const [showPopup, setShowPopup] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [draftScore, setDraftScore] = useState(initialScore === undefined || Number.isNaN(initialScore) ? "0" : initialScore.toString());
    useEffect(() => {
        setDraftScore(initialScore === undefined || Number.isNaN(initialScore) ? "0" : initialScore.toString());
    }, [initialScore]);
    const highlightBadge = highlight
        ? {
            background: highlight.color,
            color: highlight.color === "#FACC15" ? "#0F172A" : "#FFFFFF"
        }
        : null;
    const probabilityText = probability === undefined || Number.isNaN(probability) ? "—" : probability.toFixed(2);
    const difficultyText = difficulty === undefined || Number.isNaN(difficulty) ? "—" : difficulty.toFixed(2);
    const scoreText = score === undefined || Number.isNaN(score) ? "—" : score.toFixed(2);
    const closeEditor = () => {
        setIsEditing(false);
        setDraftScore(initialScore === undefined || Number.isNaN(initialScore) ? "0" : initialScore.toString());
    };
    const tooltip = showPopup && !isEditing && typeof document !== "undefined"
        ? createPortal(_jsxs("div", { style: {
                position: "fixed",
                top: 24,
                left: "50%",
                transform: "translateX(-50%)",
                padding: "0.5rem 1rem",
                borderRadius: 8,
                background: "rgba(15, 23, 42, 0.92)",
                color: "#FFFFFF",
                fontSize: "0.9rem",
                maxWidth: 360,
                boxShadow: "0 12px 24px rgba(15, 23, 42, 0.35)",
                zIndex: 2000,
                pointerEvents: "none"
            }, children: [_jsx("strong", { style: { display: "block", marginBottom: "0.35rem" }, children: indicatorName }), _jsxs("span", { style: { fontSize: "0.8rem", color: "#CBD5E1", display: "block" }, children: ["mastery: ", masterySummary, " | p: ", probabilityText, " | \u03B2: ", difficultyText, " | score: ", scoreText] }), reason ? (_jsx("p", { style: { marginTop: "0.5rem", fontSize: "0.85rem", lineHeight: 1.4 }, children: reason })) : null] }), document.body)
        : null;
    const editor = isEditing && typeof document !== "undefined"
        ? createPortal(_jsx("div", { role: "dialog", "aria-modal": "true", style: {
                position: "fixed",
                inset: 0,
                zIndex: 2100,
                background: "rgba(15, 23, 42, 0.45)",
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                paddingTop: "10vh"
            }, onClick: closeEditor, children: _jsxs("form", { style: {
                    background: "#FFFFFF",
                    borderRadius: 12,
                    border: "1px solid #CBD5E1",
                    boxShadow: "0 16px 32px rgba(15, 23, 42, 0.3)",
                    width: 280,
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem"
                }, onClick: event => event.stopPropagation(), onSubmit: event => {
                    event.preventDefault();
                    const parsed = Number(draftScore);
                    if (Number.isNaN(parsed)) {
                        return;
                    }
                    const clamped = Math.max(0, Math.min(1, parsed));
                    onSubmitScore(clamped);
                    setDraftScore(clamped.toString());
                    setIsEditing(false);
                }, children: [_jsxs("div", { style: {
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.5rem"
                        }, children: [_jsx("span", { style: { fontWeight: 600, fontSize: "1rem", color: "#0F172A" }, children: indicatorId }), highlightBadge ? (_jsxs("span", { style: {
                                    padding: "0.1rem 0.5rem",
                                    borderRadius: 999,
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    ...highlightBadge
                                }, children: ["#", highlight?.rank] })) : null] }), _jsx("label", { htmlFor: `indicator-${indicatorId}-score`, style: { fontSize: "0.85rem", fontWeight: 600, color: "#1E293B" }, children: "Observed score (0-1)" }), _jsx("input", { id: `indicator-${indicatorId}-score`, type: "number", min: 0, max: 1, step: 0.01, value: draftScore, onChange: event => setDraftScore(event.target.value), style: {
                            width: "100%",
                            padding: "0.5rem 0.75rem",
                            borderRadius: 8,
                            border: "1px solid #CBD5E1",
                            fontSize: "0.95rem"
                        } }), _jsx("p", { style: { fontSize: "0.8rem", color: "#64748B", margin: 0 }, children: indicatorName }), _jsxs("div", { style: {
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: "0.75rem"
                        }, children: [_jsx("button", { type: "button", onClick: closeEditor, style: {
                                    background: "transparent",
                                    border: "none",
                                    color: "#64748B",
                                    fontSize: "0.85rem",
                                    cursor: "pointer"
                                }, children: "Cancel" }), _jsx("button", { type: "submit", style: {
                                    background: "#2563EB",
                                    border: "none",
                                    borderRadius: 8,
                                    color: "#FFFFFF",
                                    padding: "0.45rem 0.9rem",
                                    fontSize: "0.9rem",
                                    fontWeight: 600,
                                    cursor: "pointer"
                                }, children: "Submit" })] })] }) }), document.body)
        : null;
    return (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                    position: "relative",
                    alignItems: "flex-start",
                    cursor: "pointer"
                }, onMouseEnter: () => setShowPopup(true), onMouseLeave: () => setShowPopup(false), onClick: event => {
                    event.stopPropagation();
                    setShowPopup(false);
                    setIsEditing(true);
                }, children: [_jsxs("span", { style: {
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem"
                        }, children: [_jsx("span", { style: { fontWeight: 600 }, children: indicatorId }), highlightBadge ? (_jsxs("span", { style: {
                                    padding: "0.1rem 0.4rem",
                                    borderRadius: 999,
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    ...highlightBadge
                                }, children: ["#", highlight?.rank] })) : null] }), _jsxs("span", { style: { fontSize: "0.75rem", color: "#475569" }, children: ["mastery: ", masterySummary] }), _jsxs("span", { style: { fontSize: "0.75rem", color: "#475569" }, children: ["p: ", probabilityText, " / \u03B2: ", difficultyText] }), _jsxs("span", { style: { fontSize: "0.75rem", color: "#475569" }, children: ["score: ", scoreText] })] }), tooltip, editor] }));
};
const buildAbilityMaps = (profile) => {
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
const toNodes = (graph, placement, competencyColumns, masteryMap, recommendationHighlights, abilities, onSubmitScore) => {
    const algorithm = new ModifiedEloAlgorithm();
    const depthCache = new Map();
    const resolveDepth = (id, stack = new Set()) => {
        if (depthCache.has(id)) {
            return depthCache.get(id);
        }
        if (stack.has(id)) {
            // Cycle detected; treat current node as root level to avoid infinite recursion.
            depthCache.set(id, 0);
            return 0;
        }
        stack.add(id);
        const prerequisites = graph.reverseAdjacency.get(id);
        if (!prerequisites || prerequisites.size === 0) {
            depthCache.set(id, 0);
            stack.delete(id);
            return 0;
        }
        const prerequisiteDepths = Array.from(prerequisites.values()).map(prereq => resolveDepth(prereq, new Set(stack)));
        const depth = Math.max(0, ...prerequisiteDepths) + 1;
        depthCache.set(id, depth);
        stack.delete(id);
        return depth;
    };
    const levelOccupancy = new Map();
    const orderedIds = topologicalSort(graph);
    const indicatorNodes = [];
    orderedIds.forEach(id => {
        const context = graph.indicators.get(id);
        if (!context) {
            return;
        }
        const depth = resolveDepth(id);
        const placementInfo = placement.get(id);
        const column = placementInfo?.column ?? 0;
        const key = `${column}-${depth}`;
        const occupancyIndex = levelOccupancy.get(key) ?? 0;
        levelOccupancy.set(key, occupancyIndex + 1);
        const offset = (occupancyIndex * duplicateOffset) / 2;
        const mastery = masteryMap.get(id);
        const indicatorName = context.indicator.description || context.indicator.id;
        const indicatorMastery = abilities.indicators.get(id);
        const outcomeMastery = abilities.outcomes.get(context.outcome.id);
        const competencyMastery = abilities.competencies.get(context.competencyId);
        const gradeMastery = abilities.grades.get(context.gradeId);
        const masterySummary = [
            indicatorMastery,
            outcomeMastery,
            competencyMastery,
            gradeMastery
        ]
            .map(value => (value === undefined || Number.isNaN(value) ? "—" : value.toFixed(2)))
            .join("/");
        const beta = context.indicator.difficulty ?? 0;
        const indicatorContext = context;
        const algorithmContext = {
            indicator: indicatorContext,
            learnerProfile: {
                id: "graph-preview",
                gradeId: context.gradeId,
                indicatorStates: [],
                outcomeAbilities: [],
                competencyAbilities: [],
                gradeAbilities: []
            },
            masteryMap,
            graph,
            abilities
        };
        const result = algorithm.score(algorithmContext);
        const probability = result.probability ?? result.mastery;
        const scoreValue = result.score;
        const reason = result.reason;
        const highlight = recommendationHighlights.get(id);
        const baseStyle = {
            borderRadius: 12,
            border: "1px solid #CBD5E1",
            padding: "0.5rem 0.75rem",
            width: 160,
            background: "#FFFFFF",
            boxShadow: "0 4px 12px rgba(15, 23, 42, 0.12)",
            cursor: "pointer"
        };
        const style = highlight
            ? {
                ...baseStyle,
                border: `2px solid ${highlight.color}`,
                boxShadow: `0 8px 18px ${highlight.color}40`
            }
            : baseStyle;
        indicatorNodes.push({
            id,
            data: {
                label: (_jsx(IndicatorNodeLabel, { indicatorId: context.indicator.id, masterySummary: masterySummary, initialScore: indicatorMastery ?? mastery, indicatorName: indicatorName, probability: probability, difficulty: beta, score: scoreValue, reason: reason, highlight: highlight, onSubmitScore: value => onSubmitScore(id, value) }))
            },
            position: {
                x: column * columnSpacing + offset,
                y: depth * rowSpacing + 60 + occupancyIndex * 40
            },
            type: "default",
            style
        });
    });
    const headerNodes = competencyColumns.map(({ column, competencyName }) => ({
        id: `competency-${column}`,
        data: { label: competencyName },
        position: {
            x: column * columnSpacing,
            y: -40
        },
        draggable: false,
        selectable: false,
        type: "default",
        style: {
            border: "none",
            background: "transparent",
            fontWeight: 700,
            fontSize: "1rem",
            width: 140,
            textAlign: "center",
            pointerEvents: "none"
        }
    }));
    return [...headerNodes, ...indicatorNodes];
};
const toEdges = (graph) => {
    const edges = [];
    graph.adjacency.forEach((targets, source) => {
        targets.forEach(target => {
            edges.push({
                id: `${source}-${target}`,
                source,
                target,
                type: "smoothstep",
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 14,
                    height: 14,
                    color: "#3182CE"
                },
                style: { stroke: "#3182CE", strokeWidth: 2 }
            });
        });
    });
    return edges;
};
export const IndicatorDependencyGraph = ({ grades, learnerProfile, recommendations, onSubmitScore }) => {
    const graph = useMemo(() => buildIndicatorGraph(grades), [grades]);
    const { indicatorPlacement, competencyColumns } = useMemo(() => buildCompetencyPlacements(grades), [grades]);
    const masteryMap = useMemo(() => {
        const map = new Map();
        learnerProfile.indicatorStates.forEach(state => {
            map.set(state.indicatorId, state.mastery);
        });
        return map;
    }, [learnerProfile]);
    const recommendationHighlights = useMemo(() => {
        const map = new Map();
        recommendations.slice(0, recommendationHighlightPalette.length).forEach((rec, index) => {
            map.set(rec.indicator.id, {
                color: recommendationHighlightPalette[index],
                rank: index + 1
            });
        });
        return map;
    }, [recommendations]);
    const abilities = useMemo(() => buildAbilityMaps(learnerProfile), [learnerProfile]);
    const nodes = useMemo(() => toNodes(graph, indicatorPlacement, competencyColumns, masteryMap, recommendationHighlights, abilities, onSubmitScore), [
        graph,
        indicatorPlacement,
        competencyColumns,
        masteryMap,
        recommendationHighlights,
        abilities,
        onSubmitScore
    ]);
    const edges = useMemo(() => toEdges(graph), [graph]);
    useEffect(() => {
        console.log("[IndicatorDependencyGraph] Grades", grades);
        console.log("[IndicatorDependencyGraph] Graph", graph);
        console.log("[IndicatorDependencyGraph] MasteryMap", masteryMap);
        console.log("[IndicatorDependencyGraph] AbilityMaps", abilities);
        console.log("[IndicatorDependencyGraph] Recommendations", recommendations);
    }, [grades, graph, masteryMap, abilities, recommendations]);
    return (_jsx("div", { style: { height: 480 }, children: _jsxs(ReactFlow, { nodes: nodes, edges: edges, fitView: true, fitViewOptions: { padding: 0.2 }, children: [_jsx(Background, { gap: 20, color: "#E2E8F0" }), _jsx(Controls, {})] }) }));
};
