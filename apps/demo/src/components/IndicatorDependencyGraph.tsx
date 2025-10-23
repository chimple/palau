import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node
} from "reactflow";
import "reactflow/dist/style.css";
import { buildIndicatorGraph, type Grade, type IndicatorGraph } from "@chimple/palau-core";

export interface IndicatorDependencyGraphProps {
  grades: Grade[];
}

const levelSpacing = 260;
const verticalSpacing = 120;

const toNodes = (graph: IndicatorGraph): Node[] => {
  const depthCache = new Map<string, number>();

  const resolveDepth = (id: string): number => {
    if (depthCache.has(id)) {
      return depthCache.get(id) as number;
    }
    const prerequisites = graph.reverseAdjacency.get(id);
    if (!prerequisites || prerequisites.size === 0) {
      depthCache.set(id, 0);
      return 0;
    }
    const depth =
      Math.max(
        ...Array.from(prerequisites.values()).map(prereq => resolveDepth(prereq))
      ) + 1;
    depthCache.set(id, depth);
    return depth;
  };

  const levelOccupancy = new Map<number, number>();

  return Array.from(graph.indicators.entries()).map(([id, context]) => {
    const level = resolveDepth(id);
    const index = levelOccupancy.get(level) ?? 0;
    levelOccupancy.set(level, index + 1);

    const node: Node = {
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

const toEdges = (graph: IndicatorGraph): Edge[] => {
  const edges: Edge[] = [];
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

export const IndicatorDependencyGraph = ({
  grades
}: IndicatorDependencyGraphProps) => {
  const graph = useMemo(() => buildIndicatorGraph(grades), [grades]);
  const nodes = useMemo(() => toNodes(graph), [graph]);
  const edges = useMemo(() => toEdges(graph), [graph]);

  return (
    <div style={{ height: 480 }}>
      <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.2 }}>
        <Background gap={20} color="#E2E8F0" />
        <Controls />
      </ReactFlow>
    </div>
  );
};
