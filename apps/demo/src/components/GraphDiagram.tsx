import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  DependencyGraph,
  GraphSnapshot,
  RecommendationContext,
} from "@pal/core";

interface GraphDiagramProps {
  graph: DependencyGraph;
  snapshot: GraphSnapshot;
  recommendation: RecommendationContext;
  targetId: string;
}

interface Position {
  x: number;
  y: number;
  level: number;
}

const LEVEL_SPACING = 180;
const NODE_SPACING = 200;
const NODE_RADIUS = 48;
const MARGIN = 80;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.6;

const buildDependents = (
  graph: DependencyGraph
): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const indicator of graph.indicators) {
    if (!map.has(indicator.id)) {
      map.set(indicator.id, []);
    }
    for (const prereq of indicator.prerequisites) {
      const dependents = map.get(prereq) ?? [];
      dependents.push(indicator.id);
      map.set(prereq, dependents);
    }
  }
  return map;
};

const computeLevels = (graph: DependencyGraph): Map<string, number> => {
  const dependents = buildDependents(graph);
  const levels = new Map<string, number>();
  const indegree = new Map<string, number>();
  const queue: string[] = [];

  for (const indicator of graph.indicators) {
    indegree.set(indicator.id, indicator.prerequisites.length);
    if (indicator.prerequisites.length === 0) {
      queue.push(indicator.id);
      levels.set(indicator.id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current) ?? 0;
    const nextNodes = dependents.get(current) ?? [];
    for (const next of nextNodes) {
      const nextIndegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextIndegree);
      const candidateLevel = Math.max(
        levels.get(next) ?? 0,
        currentLevel + 1
      );
      levels.set(next, candidateLevel);
      if (nextIndegree <= 0) {
        queue.push(next);
      }
    }
  }

  // Fallback for any nodes left unattached (e.g. cycles)
  for (const indicator of graph.indicators) {
    if (!levels.has(indicator.id)) {
      levels.set(indicator.id, 0);
    }
  }

  return levels;
};

const computeLayout = (graph: DependencyGraph): Map<string, Position> => {
  const levels = computeLevels(graph);
  const layout = new Map<string, Position>();
  const groups = new Map<number, string[]>();

  for (const [id, level] of levels.entries()) {
    const group = groups.get(level) ?? [];
    group.push(id);
    groups.set(level, group);
  }

  for (const group of groups.values()) {
    group.sort();
  }

  for (const [level, nodes] of groups.entries()) {
    const totalWidth =
      nodes.length > 1 ? (nodes.length - 1) * NODE_SPACING : 0;
    nodes.forEach((id, idx) => {
      const offset =
        nodes.length > 1 ? idx * NODE_SPACING - totalWidth / 2 : 0;
      const x = offset;
      const y = level * LEVEL_SPACING;
      layout.set(id, { x, y, level });
    });
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const pos of layout.values()) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
  }

  const offsetX = Number.isFinite(minX) ? MARGIN - minX : MARGIN;
  const offsetY = Number.isFinite(minY) ? MARGIN - minY : MARGIN;

  for (const pos of layout.values()) {
    pos.x += offsetX;
    pos.y += offsetY;
  }

  return layout;
};

const statusColor = (args: {
  id: string;
  snapshot: GraphSnapshot;
  recommendation: RecommendationContext;
  targetId: string;
}): { fill: string; stroke: string } => {
  const { id, snapshot, recommendation, targetId } = args;
  const item = snapshot.snapshot.find((entry) => entry.indicatorId === id);
  const isTarget = id === targetId;
  const isCandidate = recommendation.candidateId === id;
  const baseStroke = isTarget ? "#1d4ed8" : "rgba(51,65,85,0.35)";

  if (isCandidate) {
    switch (recommendation.status) {
      case "recommended":
        return { fill: "#c7d2fe", stroke: "#4338ca" };
      case "auto-mastered":
        return { fill: "#bbf7d0", stroke: "#15803d" };
      case "needs-remediation":
        return { fill: "#fecaca", stroke: "#b91c1c" };
      default:
        return { fill: "#e2e8f0", stroke: "#334155" };
    }
  }

  switch (item?.status) {
    case "mastered":
      return { fill: "#dcfce7", stroke: baseStroke };
    case "zpd":
      return { fill: "#dbeafe", stroke: baseStroke };
    case "below":
    default:
      return { fill: "#fef3c7", stroke: baseStroke };
  }
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const GraphDiagram = ({
  graph,
  snapshot,
  recommendation,
  targetId,
}: GraphDiagramProps) => {
  const layout = useMemo(() => computeLayout(graph), [graph]);
  const positions = useMemo(
    () =>
      Array.from(layout.entries()).map(([id, pos]) => ({
        id,
        ...pos,
      })),
    [layout]
  );
  const dependents = useMemo(() => buildDependents(graph), [graph]);

  const maxXBase = positions.length
    ? Math.max(...positions.map((pos) => pos.x)) + NODE_RADIUS
    : 400;
  const maxYBase = positions.length
    ? Math.max(...positions.map((pos) => pos.y)) + NODE_RADIUS
    : 400;

  const width = maxXBase + MARGIN;
  const height = maxYBase + MARGIN;

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const applyZoom = useCallback((delta: number, origin?: { x: number; y: number }) => {
    setScale((prevScale) => {
      const nextScale = clamp(prevScale + delta, ZOOM_MIN, ZOOM_MAX);
      if (!origin) {
        return nextScale;
      }
      const ratio = nextScale / prevScale;
      setTranslate((prev) => ({
        x: origin.x - ratio * (origin.x - prev.x),
        y: origin.y - ratio * (origin.y - prev.y),
      }));
      return nextScale;
    });
  }, []);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const pointer = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const delta = event.deltaY < 0 ? 0.12 : -0.12;
      applyZoom(delta, pointer);
    },
    [applyZoom]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType !== "touch") {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsPanning(true);
      panPointRef.current = { x: event.clientX, y: event.clientY };
    },
    []
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isPanning) {
        return;
      }
      event.preventDefault();
      const dx = event.clientX - panPointRef.current.x;
      const dy = event.clientY - panPointRef.current.y;
      panPointRef.current = { x: event.clientX, y: event.clientY };
      setTranslate((prev) => ({
        x: prev.x + dx,
        y: prev.y + dy,
      }));
    },
    [isPanning]
  );

  const endPan = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isPanning) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setIsPanning(false);
    },
    [isPanning]
  );

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  return (
    <div>
      <div className="graph-legend section">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "#dbeafe" }} />
          ZPD band
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "#dcfce7" }} />
          Mastered
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "#fecaca" }} />
          Needs support
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: "#c7d2fe" }} />
          Recommended action
        </span>
      </div>
      <div className="graph-toolbar">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => applyZoom(0.18)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => applyZoom(-0.18)}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Reset zoom and pan"
          onClick={resetView}
        >
          reset
        </button>
        <span>
          zoom {(scale * 100).toFixed(0)}%
        </span>
      </div>
      <div
        className="graph-canvas"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerLeave={endPan}
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
      >
        <svg
          className="graph-surface"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          </defs>
          <g
            transform={`translate(${translate.x}, ${translate.y}) scale(${scale})`}
          >
            {positions.map((pos) => {
              const targets = dependents.get(pos.id) ?? [];
              return targets.map((target) => {
                const targetPos = layout.get(target);
                if (!targetPos) {
                  return null;
                }
                return (
                  <line
                    key={`${pos.id}-${target}`}
                    x1={pos.x}
                    y1={pos.y + NODE_RADIUS}
                    x2={targetPos.x}
                    y2={targetPos.y - NODE_RADIUS}
                    stroke="#cbd5f5"
                    strokeWidth={2}
                    markerEnd="url(#arrow)"
                  />
                );
              });
            })}
            {positions.map((pos) => {
              const palette = statusColor({
                id: pos.id,
                snapshot,
                recommendation,
                targetId,
              });
              const indicator = graph.indicators.find(
                (li) => li.id === pos.id
              );
              const probability =
                snapshot.snapshot.find((entry) => entry.indicatorId === pos.id)
                  ?.probability ?? 0;

              return (
                <g key={pos.id}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={NODE_RADIUS}
                    fill={palette.fill}
                    stroke={palette.stroke}
                    strokeWidth={pos.id === targetId ? 3 : 2}
                  />
                  <text
                    x={pos.x}
                    y={pos.y - 16}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="600"
                    fill="#1f2937"
                  >
                    {indicator?.label ?? pos.id}
                  </text>
                  <text
                    x={pos.x}
                    y={pos.y + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#4b5563"
                  >
                    {pos.id}
                  </text>
                  <text
                    x={pos.x}
                    y={pos.y + 24}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#0f172a"
                  >
                    {(probability * 100).toFixed(0)}%
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
};

export default GraphDiagram;
