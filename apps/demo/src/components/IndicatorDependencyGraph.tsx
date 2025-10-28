import { useEffect, useMemo, useState } from "react";
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
  type IndicatorGraph,
  type LearnerProfile,
  type Recommendation
} from "@chimple/palau-core";

export interface IndicatorDependencyGraphProps {
  grades: Grade[];
  learnerProfile: LearnerProfile;
  recommendations: Recommendation[];
  onUpdateMastery: (indicatorId: string, mastery: number) => void;
}

const columnSpacing = 260;
const rowSpacing = 160;
const duplicateOffset = 160;
const recommendationHighlightPalette = ["#22C55E", "#3B82F6", "#8B5CF6", "#EC4899", "#FACC15"];

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

interface IndicatorNodeLabelProps {
  indicatorId: string;
  masteryLabel: string;
  masteryValue?: number;
  indicatorName: string;
  onSubmitMastery: (value: number) => void;
  highlight?: {
    color: string;
    rank: number;
  };
}

const IndicatorNodeLabel = ({
  indicatorId,
  masteryLabel,
  masteryValue,
  indicatorName,
  onSubmitMastery,
  highlight
}: IndicatorNodeLabelProps) => {
  const [showPopup, setShowPopup] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftMastery, setDraftMastery] = useState<string>(
    masteryValue === undefined || Number.isNaN(masteryValue) ? "0" : masteryValue.toString()
  );

  useEffect(() => {
    setDraftMastery(
      masteryValue === undefined || Number.isNaN(masteryValue) ? "0" : masteryValue.toString()
    );
  }, [masteryValue]);

  const highlightBadge = highlight
    ? {
        background: highlight.color,
        color: highlight.color === "#FACC15" ? "#0F172A" : "#FFFFFF"
      }
    : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        position: "relative",
        alignItems: "flex-start",
        cursor: "pointer"
      }}
      onMouseEnter={() => setShowPopup(true)}
      onMouseLeave={() => setShowPopup(false)}
      onClick={event => {
        event.stopPropagation();
        setShowPopup(false);
        setIsEditing(true);
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem"
        }}
      >
        <span style={{ fontWeight: 600 }}>{indicatorId}</span>
        {highlightBadge ? (
          <span
            style={{
              padding: "0.1rem 0.4rem",
              borderRadius: 999,
              fontSize: "0.75rem",
              fontWeight: 600,
              ...highlightBadge
            }}
          >
            #{highlight?.rank}
          </span>
        ) : null}
      </div>
      <span style={{ fontSize: "0.85rem", color: "#475569" }}>{masteryLabel}</span>
      {showPopup && !isEditing ? (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.5rem",
            padding: "0.5rem 0.75rem",
            borderRadius: 8,
            background: "rgba(15, 23, 42, 0.92)",
            color: "#FFFFFF",
            fontSize: "0.85rem",
            maxWidth: 240,
            boxShadow: "0 8px 16px rgba(15, 23, 42, 0.25)",
            zIndex: 10
          }}
        >
          {indicatorName}
        </div>
      ) : null}
      {isEditing ? (
        <form
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: highlight ? "3.5rem" : "2.5rem",
            padding: "0.75rem",
            borderRadius: 12,
            background: "#FFFFFF",
            boxShadow: "0 12px 24px rgba(15, 23, 42, 0.2)",
            width: 220,
            zIndex: 20,
            border: "1px solid #CBD5E1",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem"
          }}
          onClick={event => event.stopPropagation()}
          onSubmit={event => {
            event.preventDefault();
            const parsed = Number(draftMastery);
            if (Number.isNaN(parsed)) {
              return;
            }
            const clamped = Math.max(0, Math.min(1, parsed));
            onSubmitMastery(clamped);
            setIsEditing(false);
          }}
        >
          <label
            htmlFor={`indicator-${indicatorId}-mastery`}
            style={{ fontSize: "0.8rem", fontWeight: 600, color: "#1E293B" }}
          >
            Mastery (0-1)
          </label>
          <input
            id={`indicator-${indicatorId}-mastery`}
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={draftMastery}
            onChange={event => setDraftMastery(event.target.value)}
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              borderRadius: 8,
              border: "1px solid #CBD5E1",
              fontSize: "0.9rem"
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.5rem"
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setDraftMastery(
                  masteryValue === undefined || Number.isNaN(masteryValue)
                    ? "0"
                    : masteryValue.toString()
                );
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#64748B",
                fontSize: "0.85rem",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                background: "#2563EB",
                border: "none",
                borderRadius: 8,
                color: "#FFFFFF",
                padding: "0.35rem 0.75rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Submit
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
};

const toNodes = (
  graph: IndicatorGraph,
  placement: Map<string, CompetencyPlacement>,
  competencyColumns: PlacementResult["competencyColumns"],
  masteryMap: Map<string, number>,
  recommendationHighlights: Map<string, { color: string; rank: number }>,
  onUpdateMastery: (indicatorId: string, mastery: number) => void
): Node[] => {
  const depthCache = new Map<string, number>();

  const resolveDepth = (id: string, stack: Set<string> = new Set()): number => {
    if (depthCache.has(id)) {
      return depthCache.get(id) as number;
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

    const prerequisiteDepths = Array.from(prerequisites.values()).map(prereq =>
      resolveDepth(prereq, new Set(stack))
    );

    const depth = Math.max(0, ...prerequisiteDepths) + 1;
    depthCache.set(id, depth);
    stack.delete(id);
    return depth;
  };

  const levelOccupancy = new Map<string, number>();

  const orderedIds = topologicalSort(graph);

  const indicatorNodes: Node[] = [];

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
    const masteryLabel =
      mastery === undefined || Number.isNaN(mastery)
        ? "Mastery: —"
        : `Mastery: ${(mastery * 100).toFixed(0)}%`;
    const indicatorName = context.indicator.description || context.indicator.id;

    const highlight = recommendationHighlights.get(id);
    const baseStyle = {
      borderRadius: 12,
      border: "1px solid #CBD5E1",
      padding: "0.5rem 0.75rem",
      width: 220,
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
        label: (
          <IndicatorNodeLabel
            indicatorId={context.indicator.id}
            masteryLabel={masteryLabel}
            masteryValue={mastery}
            indicatorName={indicatorName}
            highlight={highlight}
            onSubmitMastery={value => onUpdateMastery(id, value)}
          />
        )
      },
      position: {
        x: column * columnSpacing + offset,
        y: depth * rowSpacing + 60 + occupancyIndex * 40
      },
      type: "default",
      style
    });
  });

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
  grades,
  learnerProfile,
  recommendations,
  onUpdateMastery
}: IndicatorDependencyGraphProps) => {
  const graph = useMemo(() => buildIndicatorGraph(grades), [grades]);
  const { indicatorPlacement, competencyColumns } = useMemo(
    () => buildCompetencyPlacements(grades),
    [grades]
  );
  const masteryMap = useMemo(() => {
    const map = new Map<string, number>();
    learnerProfile.indicatorStates.forEach(state => {
      map.set(state.indicatorId, state.mastery);
    });
    return map;
  }, [learnerProfile]);
  const recommendationHighlights = useMemo(() => {
    const map = new Map<string, { color: string; rank: number }>();
    recommendations.slice(0, recommendationHighlightPalette.length).forEach((rec, index) => {
      map.set(rec.indicator.id, {
        color: recommendationHighlightPalette[index],
        rank: index + 1
      });
    });
    return map;
  }, [recommendations]);
  const nodes = useMemo(
    () =>
      toNodes(
        graph,
        indicatorPlacement,
        competencyColumns,
        masteryMap,
        recommendationHighlights,
        onUpdateMastery
      ),
    [
      graph,
      indicatorPlacement,
      competencyColumns,
      masteryMap,
      recommendationHighlights,
      onUpdateMastery
    ]
  );
  const edges = useMemo(() => toEdges(graph), [graph]);

  useEffect(() => {
    console.log("[IndicatorDependencyGraph] Grades", grades);
    console.log("[IndicatorDependencyGraph] Graph", graph);
    console.log("[IndicatorDependencyGraph] MasteryMap", masteryMap);
    console.log("[IndicatorDependencyGraph] Recommendations", recommendations);
  }, [grades, graph, masteryMap, recommendations]);

  return (
    <div style={{ height: 480 }}>
      <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.2 }}>
        <Background gap={20} color="#E2E8F0" />
        <Controls />
      </ReactFlow>
    </div>
  );
};
