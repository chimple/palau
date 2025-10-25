import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node
} from "reactflow";
import "reactflow/dist/style.css";
import {
  buildIndicatorGraph,
  topologicalSort,
  type Grade,
  type IndicatorGraph
} from "@chimple/palau-core";

export interface IndicatorDependencyGraphProps {
  grades: Grade[];
}

const columnSpacing = 260;
const rowSpacing = 160;
const duplicateOffset = 160;

interface CompetencyPlacement {
  column: number;
  competencyName: string;
}

interface PlacementResult {
  indicatorPlacement: Map<string, CompetencyPlacement>;
  competencyColumns: Array<{
    column: number;
    competencyName: string;
  }>;
}

const buildCompetencyPlacements = (grades: Grade[]): PlacementResult => {
  const indicatorPlacement = new Map<string, CompetencyPlacement>();
  const competencyColumns: PlacementResult["competencyColumns"] = [];
  let columnIndex = 0;

  grades.forEach(grade => {
    grade.subjects.forEach(subject => {
      subject.competencies.forEach(competency => {
        const currentColumn = columnIndex++;
        competencyColumns.push({
          column: currentColumn,
          competencyName: competency.name
        });

        competency.outcomes.forEach(outcome => {
          outcome.indicators.forEach(indicator => {
            indicatorPlacement.set(indicator.id, {
              column: currentColumn,
              competencyName: competency.name
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

const toNodes = (
  graph: IndicatorGraph,
  placement: Map<string, CompetencyPlacement>,
  competencyColumns: PlacementResult["competencyColumns"]
): Node[] => {
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

  const levelOccupancy = new Map<string, number>();

  const orderedIds = topologicalSort(graph);

  const indicatorNodes = orderedIds
    .map(id => {
      const context = graph.indicators.get(id);
      if (!context) {
        return undefined;
      }

      const depth = resolveDepth(id);
      const placementInfo = placement.get(id);
      const column = placementInfo?.column ?? 0;
      const key = `${column}-${depth}`;
      const occupancyIndex = levelOccupancy.get(key) ?? 0;
      levelOccupancy.set(key, occupancyIndex + 1);

      const offset = (occupancyIndex * duplicateOffset) / 2;

      return {
        id,
        data: {
          label: context.indicator.description
        },
        position: {
          x: column * columnSpacing + offset,
          y: depth * rowSpacing + 60 + occupancyIndex * 32
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
      } satisfies Node;
    })
    .filter((node): node is Node => Boolean(node));

  const headerNodes: Node[] = competencyColumns.map(({ column, competencyName }) => ({
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
  const { indicatorPlacement, competencyColumns } = useMemo(
    () => buildCompetencyPlacements(grades),
    [grades]
  );
  const nodes = useMemo(
    () => toNodes(graph, indicatorPlacement, competencyColumns),
    [graph, indicatorPlacement, competencyColumns]
  );
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
