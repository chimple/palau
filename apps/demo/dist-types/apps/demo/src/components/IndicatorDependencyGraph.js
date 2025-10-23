import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import ReactFlow, { Background, Controls, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import { buildIndicatorGraph } from "@chimple/palau-core";
const levelSpacing = 260;
const verticalSpacing = 120;
const toNodes = (graph) => {
    const depthCache = new Map();
    const resolveDepth = (id) => {
        if (depthCache.has(id)) {
            return depthCache.get(id);
        }
        const prerequisites = graph.reverseAdjacency.get(id);
        if (!prerequisites || prerequisites.size === 0) {
            depthCache.set(id, 0);
            return 0;
        }
        const depth = Math.max(...Array.from(prerequisites.values()).map(prereq => resolveDepth(prereq))) + 1;
        depthCache.set(id, depth);
        return depth;
    };
    const levelOccupancy = new Map();
    return Array.from(graph.indicators.entries()).map(([id, context]) => {
        const level = resolveDepth(id);
        const index = levelOccupancy.get(level) ?? 0;
        levelOccupancy.set(level, index + 1);
        const node = {
            id,
            data: { label: context.indicator.description },
            position: {
                x: level * levelSpacing,
                y: index * verticalSpacing
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
        };
        return node;
    });
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
    const nodes = useMemo(() => toNodes(graph), [graph]);
    const edges = useMemo(() => toEdges(graph), [graph]);
    return (_jsx("div", { style: { height: 480 }, children: _jsxs(ReactFlow, { nodes: nodes, edges: edges, fitView: true, fitViewOptions: { padding: 0.2 }, children: [_jsx(Background, { gap: 20, color: "#E2E8F0" }), _jsx(Controls, {})] }) }));
};
