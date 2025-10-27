import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import ReactFlow, { Background, Controls, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import { buildIndicatorGraph, topologicalSort } from "@chimple/palau-core";
const columnSpacing = 260;
const rowSpacing = 160;
const duplicateOffset = 160;
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
const toNodes = (graph, placement, competencyColumns) => {
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
        indicatorNodes.push({
            id,
            data: {
                label: context.indicator.id
            },
            position: {
                x: column * columnSpacing + offset,
                y: depth * rowSpacing + 60 + occupancyIndex * 40
            },
            type: "default",
            style: {
                borderRadius: 12,
                border: "1px solid #CBD5E1",
                padding: "0.5rem 0.75rem",
                width: 220,
                background: "#FFFFFF",
                boxShadow: "0 4px 12px rgba(15, 23, 42, 0.12)"
            }
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
            width: 220,
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
export const IndicatorDependencyGraph = ({ grades }) => {
    const graph = useMemo(() => buildIndicatorGraph(grades), [grades]);
    const { indicatorPlacement, competencyColumns } = useMemo(() => buildCompetencyPlacements(grades), [grades]);
    const nodes = useMemo(() => toNodes(graph, indicatorPlacement, competencyColumns), [graph, indicatorPlacement, competencyColumns]);
    const edges = useMemo(() => toEdges(graph), [graph]);
    return (_jsx("div", { style: { height: 480 }, children: _jsxs(ReactFlow, { nodes: nodes, edges: edges, fitView: true, fitViewOptions: { padding: 0.2 }, children: [_jsx(Background, { gap: 20, color: "#E2E8F0" }), _jsx(Controls, {})] }) }));
};
