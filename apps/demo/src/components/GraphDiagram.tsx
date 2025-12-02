import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AbilityState,
  BlendWeights,
  DependencyGraph,
  GraphSnapshot,
  Indicator,
  RecommendationContext,
} from "@pal/core";

interface GraphDiagramProps {
  graph: DependencyGraph;
  snapshot: GraphSnapshot;
  recommendation: RecommendationContext;
  targetId: string;
  abilities: AbilityState;
  blendWeights: BlendWeights;
  subjectFilterId: string;
  domainFilterId: string;
  competencyFilterId: string;
  onSubjectFilterChange: (subjectId: string) => void;
  onDomainFilterChange: (domainId: string) => void;
  onCompetencyFilterChange: (competencyId: string) => void;
  overrideIndicatorId: string;
  onOverrideIndicatorChange: (indicatorId: string) => void;
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
  graph: DependencyGraph,
  allowed?: Set<string>
): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  const shouldInclude = (id: string) => !allowed || allowed.has(id);

  for (const indicator of graph.indicators) {
    if (!shouldInclude(indicator.id)) {
      continue;
    }

    if (!map.has(indicator.id)) {
      map.set(indicator.id, []);
    }

    for (const prereq of indicator.prerequisites) {
      if (!shouldInclude(prereq)) {
        continue;
      }
      const dependents = map.get(prereq) ?? [];
      dependents.push(indicator.id);
      map.set(prereq, dependents);
    }
  }
  return map;
};

const computeLevels = (
  graph: DependencyGraph,
  allowed?: Set<string>
): Map<string, number> => {
  const dependents = buildDependents(graph, allowed);
  const levels = new Map<string, number>();
  const indegree = new Map<string, number>();
  const queue: string[] = [];
  const shouldInclude = (id: string) => !allowed || allowed.has(id);

  for (const indicator of graph.indicators) {
    if (!shouldInclude(indicator.id)) {
      continue;
    }

    const prereqs = indicator.prerequisites.filter((pre) =>
      shouldInclude(pre)
    );

    indegree.set(indicator.id, prereqs.length);
    if (prereqs.length === 0) {
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
    if (!shouldInclude(indicator.id)) {
      continue;
    }
    if (!levels.has(indicator.id)) {
      levels.set(indicator.id, 0);
    }
  }

  return levels;
};

const computeLayout = (
  graph: DependencyGraph,
  allowed?: Set<string>
): Map<string, Position> => {
  const levels = computeLevels(graph, allowed);
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
  abilities,
  blendWeights,
  subjectFilterId,
  domainFilterId,
  competencyFilterId,
  onSubjectFilterChange,
  onDomainFilterChange,
  onCompetencyFilterChange,
  overrideIndicatorId,
  onOverrideIndicatorChange,
}: GraphDiagramProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndicatorId, setSearchIndicatorId] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    indicatorId: string;
    x: number;
    y: number;
  } | null>(null);

  const subjectOptions = useMemo(() => {
    return [...graph.subjects].sort((a, b) => a.label.localeCompare(b.label));
  }, [graph]);

  const domainOptions = useMemo(() => {
    let options = [...graph.domains];
    if (subjectFilterId) {
      options = options.filter(
        (domain) => domain.subjectId === subjectFilterId
      );
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [graph, subjectFilterId]);

  useEffect(() => {
    if (!subjectFilterId) {
      return;
    }
    if (!subjectOptions.some((subject) => subject.id === subjectFilterId)) {
      onSubjectFilterChange("");
    }
  }, [subjectFilterId, subjectOptions, onSubjectFilterChange]);

  useEffect(() => {
    if (!domainFilterId) {
      return;
    }
    if (!domainOptions.some((domain) => domain.id === domainFilterId)) {
      onDomainFilterChange("");
    }
  }, [domainFilterId, domainOptions, onDomainFilterChange]);

  const subjectLabelLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const subject of graph.subjects) {
      map.set(subject.id, subject.label ?? subject.id);
    }
    return map;
  }, [graph]);

  const domainLabelLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const domain of graph.domains) {
      map.set(domain.id, domain.label ?? domain.id);
    }
    return map;
  }, [graph]);

  const competencyIndex = useMemo(() => {
    const map = new Map(graph.competencies.map((item) => [item.id, item]));
    return map;
  }, [graph]);

  const competencyLabelLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const competency of graph.competencies) {
      map.set(competency.id, competency.label ?? competency.id);
    }
    return map;
  }, [graph]);

  const outcomeIndex = useMemo(() => {
    const map = new Map(graph.outcomes.map((item) => [item.id, item]));
    return map;
  }, [graph]);

  const filteredCompetencyIds = useMemo(() => {
    if (!subjectFilterId && !domainFilterId) {
      return graph.competencies.map((competency) => competency.id);
    }
    const ids = new Set<string>();
    for (const indicator of graph.indicators) {
      if (subjectFilterId && indicator.subjectId !== subjectFilterId) {
        continue;
      }
      if (domainFilterId && indicator.domainId !== domainFilterId) {
        continue;
      }
      ids.add(indicator.competencyId);
    }
    return Array.from(ids);
  }, [graph, subjectFilterId, domainFilterId]);

  const competencyOptions = useMemo(() => {
    const options = filteredCompetencyIds
      .map((id) => competencyIndex.get(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredCompetencyIds, competencyIndex]);

  useEffect(() => {
    if (!competencyFilterId) {
      return;
    }
    if (!filteredCompetencyIds.includes(competencyFilterId)) {
      onCompetencyFilterChange("");
    }
  }, [competencyFilterId, filteredCompetencyIds, onCompetencyFilterChange]);

  useEffect(() => {
    if (!overrideIndicatorId) {
      return;
    }
    const indicator = graph.indicators.find((item) => item.id === overrideIndicatorId);
    if (!indicator) {
      return;
    }
    if (indicator.subjectId !== subjectFilterId) {
      onSubjectFilterChange(indicator.subjectId);
    }
    if (indicator.domainId !== domainFilterId) {
      onDomainFilterChange(indicator.domainId);
    }
    if (indicator.competencyId !== competencyFilterId) {
      onCompetencyFilterChange(indicator.competencyId);
    }
  }, [
    overrideIndicatorId,
    graph,
    subjectFilterId,
    domainFilterId,
    competencyFilterId,
    onSubjectFilterChange,
    onDomainFilterChange,
    onCompetencyFilterChange,
  ]);

  const indicatorIndex = useMemo(() => {
    const map = new Map(graph.indicators.map((indicator) => [indicator.id, indicator]));
    return map;
  }, [graph]);

  const probabilityIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of snapshot.snapshot) {
      map.set(entry.indicatorId, entry.probability);
    }
    return map;
  }, [snapshot]);

  const formatAbilityValue = (value: number) => value.toFixed(2);
  const formatProbabilityValue = (value: number) => (value * 100).toFixed(1);

  const getIndicatorAbilitySnapshot = useCallback(
    (indicatorId: string) => {
      const indicator = indicatorIndex.get(indicatorId);
      if (!indicator) {
        return null;
      }
      const thetaIndicator = abilities.indicator[indicator.id] ?? 0;
      const thetaOutcome = abilities.outcome[indicator.outcomeId] ?? 0;
      const thetaCompetency = abilities.competency[indicator.competencyId] ?? 0;
      const thetaDomain = abilities.domain[indicator.domainId] ?? 0;
      const thetaSubject = abilities.subject[indicator.subjectId] ?? 0;
      const thetaBlend =
        thetaIndicator * blendWeights.indicator +
        thetaOutcome * blendWeights.outcome +
        thetaCompetency * blendWeights.competency +
        thetaDomain * blendWeights.domain +
        thetaSubject * blendWeights.subject;
      const probability = probabilityIndex.get(indicator.id) ?? 0;
      return {
        indicator,
        thetaIndicator,
        thetaOutcome,
        thetaCompetency,
        thetaSubject,
        thetaDomain,
        thetaBlend,
        probability,
      };
    },
    [abilities, blendWeights, indicatorIndex, probabilityIndex]
  );

  useEffect(() => {
    if (searchIndicatorId && !indicatorIndex.has(searchIndicatorId)) {
      setSearchIndicatorId("");
    }
  }, [indicatorIndex, searchIndicatorId]);

  const globalDependents = useMemo(() => buildDependents(graph), [graph]);

  const searchConnectedFilter = useMemo(() => {
    if (!searchIndicatorId) {
      return undefined;
    }
    const connected = new Set<string>();
    const stack = [searchIndicatorId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (connected.has(current)) {
        continue;
      }
      connected.add(current);
      const indicator = indicatorIndex.get(current);
      if (indicator) {
        for (const prereq of indicator.prerequisites) {
          stack.push(prereq);
        }
      }
      const dependents = globalDependents.get(current) ?? [];
      for (const dep of dependents) {
        stack.push(dep);
      }
    }
    return connected;
  }, [searchIndicatorId, indicatorIndex, globalDependents]);

  const indicatorFilter = useMemo<Set<string> | undefined>(() => {
    if (searchConnectedFilter) {
      return searchConnectedFilter;
    }
    if (
      !subjectFilterId &&
      !domainFilterId &&
      !competencyFilterId
    ) {
      return undefined;
    }
    const allowed = new Set(
      graph.indicators
        .filter((indicator) => {
          if (subjectFilterId && indicator.subjectId !== subjectFilterId) {
            return false;
          }
          if (domainFilterId && indicator.domainId !== domainFilterId) {
            return false;
          }
          if (
            competencyFilterId &&
            indicator.competencyId !== competencyFilterId
          ) {
            return false;
          }
          return true;
        })
        .map((indicator) => indicator.id)
    );
    return allowed;
  }, [
    graph,
    subjectFilterId,
    domainFilterId,
    competencyFilterId,
    searchConnectedFilter,
  ]);

  const layout = useMemo(
    () => computeLayout(graph, indicatorFilter),
    [graph, indicatorFilter]
  );
  const positions = useMemo(
    () =>
      Array.from(layout.entries()).map(([id, pos]) => ({
        id,
        ...pos,
      })),
    [layout]
  );
  const dependents = useMemo(
    () => buildDependents(graph, indicatorFilter),
    [graph, indicatorFilter]
  );

  const overrideOptions = useMemo(() => {
    const filtered = graph.indicators.filter((indicator) => {
      if (subjectFilterId && indicator.subjectId !== subjectFilterId) {
        return false;
      }
      if (domainFilterId && indicator.domainId !== domainFilterId) {
        return false;
      }
      if (competencyFilterId && indicator.competencyId !== competencyFilterId) {
        return false;
      }
      return true;
    });
    const hardestByCompetency = new Map<string, { indicatorId: string; difficulty: number }>();
    for (const indicator of filtered) {
      const existing = hardestByCompetency.get(indicator.competencyId);
      if (!existing || indicator.difficulty > existing.difficulty) {
        hardestByCompetency.set(indicator.competencyId, {
          indicatorId: indicator.id,
          difficulty: indicator.difficulty,
        });
      }
    }
    const highlightSet = new Set<string>();
    for (const entry of hardestByCompetency.values()) {
      highlightSet.add(entry.indicatorId);
    }
    return {
      filtered,
      highlightSet,
    };
  }, [graph, subjectFilterId, domainFilterId, competencyFilterId]);

  const overrideSelectionMissing =
    Boolean(overrideIndicatorId) &&
    !overrideOptions.filtered.some((indicator) => indicator.id === overrideIndicatorId);

  const hoverSnapshot = hoverInfo
    ? getIndicatorAbilitySnapshot(hoverInfo.indicatorId)
    : null;

  const width = positions.length
    ? Math.max(...positions.map((pos) => pos.x)) + NODE_RADIUS + MARGIN
    : 400;
  const height = positions.length
    ? Math.max(...positions.map((pos) => pos.y)) + NODE_RADIUS + MARGIN
    : 400;

  const handleSubjectFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onSubjectFilterChange(event.target.value);
    },
    [onSubjectFilterChange]
  );

  const handleDomainFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onDomainFilterChange(event.target.value);
    },
    [onDomainFilterChange]
  );

  const handleCompetencyFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onCompetencyFilterChange(event.target.value);
    },
    [onCompetencyFilterChange]
  );

  const noResults = indicatorFilter !== undefined && positions.length === 0;

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

  const focusOnIndicator = useCallback(
    (indicatorId: string) => {
      const position = layout.get(indicatorId);
      if (!position) {
        return;
      }
      const centerX = width / 2;
      const centerY = height / 2;
      setScale(1);
      setTranslate({
        x: centerX - position.x,
        y: centerY - position.y,
      });
    },
    [layout, width, height]
  );

  useEffect(() => {
    if (searchIndicatorId) {
      focusOnIndicator(searchIndicatorId);
    }
  }, [searchIndicatorId, focusOnIndicator]);

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

  const selectSearchIndicator = useCallback(
    (indicatorId: string) => {
      setSearchIndicatorId(indicatorId);
      setSearchError(null);
      onOverrideIndicatorChange(indicatorId);
    },
    [onOverrideIndicatorChange]
  );

  const resolveSearchIndicator = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        return null;
      }
      const pool = overrideOptions.filtered;
      if (pool.length === 0) {
        return null;
      }
      const directMatch = pool.find((indicator) => indicator.id === trimmed);
      if (directMatch) {
        return directMatch.id;
      }
      const normalized = trimmed.toLowerCase();
      const idMatch = pool.find(
        (indicator) => indicator.id.toLowerCase() === normalized
      );
      if (idMatch) {
        return idMatch.id;
      }
      const labelMatch = pool.find((indicator) =>
        indicator.label.toLowerCase().includes(normalized)
      );
      return labelMatch?.id ?? null;
    },
    [overrideOptions]
  );

  const handleSearchSubmit = useCallback(
    (event?: React.FormEvent<HTMLFormElement>) => {
      if (event) {
        event.preventDefault();
      }
      const trimmed = searchQuery.trim();
      if (!trimmed) {
        setSearchIndicatorId("");
        setSearchError(null);
        return;
      }
      const resolved = resolveSearchIndicator(trimmed);
      if (resolved) {
        selectSearchIndicator(resolved);
      } else {
        setSearchIndicatorId("");
        setSearchError("No learning indicator matches that search.");
      }
    },
    [resolveSearchIndicator, searchQuery, selectSearchIndicator]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchIndicatorId("");
    setSearchError(null);
  }, []);

  const handleNodeEnter = useCallback(
    (event: React.MouseEvent<SVGGElement>, indicatorId: string) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const x = event.clientX - (rect?.left ?? 0);
      const y = event.clientY - (rect?.top ?? 0);
      setHoverInfo({ indicatorId, x, y });
    },
    []
  );

  const handleNodeLeave = useCallback(() => {
    setHoverInfo(null);
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
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
      <div className="graph-filters">
        <label className="graph-filter-field">
          <span>Subject label</span>
          <select
            className="select"
            value={subjectFilterId}
            onChange={handleSubjectFilterChange}
          >
            <option value="">All subjects</option>
            {subjectOptions.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.label}
              </option>
            ))}
          </select>
        </label>
        <label className="graph-filter-field">
          <span>Domain label</span>
          <select
            className="select"
            value={domainFilterId}
            onChange={handleDomainFilterChange}
          >
            <option value="">All domains</option>
            {domainOptions.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.label}
              </option>
            ))}
          </select>
        </label>
        <label className="graph-filter-field">
          <span>Competency label</span>
          <select
            className="select"
            value={competencyFilterId}
            onChange={handleCompetencyFilterChange}
          >
            <option value="">All competencies</option>
            {competencyOptions.map((competency) => (
              <option key={competency.id} value={competency.id}>
                {competency.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="graph-override section">
        <form
          onSubmit={handleSearchSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}
        >
          <label htmlFor="graph-search-input" style={{ fontSize: "0.95rem" }}>
            Search or select a learning indicator
          </label>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <input
              id="graph-search-input"
              className="select"
              type="search"
              list="graph-indicator-options"
              value={searchQuery}
              placeholder="e.g. 5.19 or Addition Facts"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <button type="submit" className="btn">
              Search
            </button>
            <button type="button" className="btn-ghost" onClick={clearSearch}>
              Clear
            </button>
          </div>
        </form>
        <datalist id="graph-indicator-options">
          {overrideOptions.filtered.map((indicator) => (
            <option key={indicator.id} value={indicator.id}>
              {indicator.label}
            </option>
          ))}
        </datalist>
        {searchIndicatorId && (
          <p style={{ fontSize: "0.8rem", color: "#475569", marginTop: "0.35rem" }}>
            Showing network for{" "}
            <strong>
              {indicatorIndex.get(searchIndicatorId)?.label ?? searchIndicatorId} (
              {searchIndicatorId})
            </strong>
            . The manual override dropdown below has been synced to this indicator.
          </p>
        )}
        {searchError && (
          <p style={{ fontSize: "0.8rem", color: "#b91c1c", marginTop: "0.35rem" }}>
            {searchError}
          </p>
        )}
        <label htmlFor="graph-override-select" style={{ fontSize: "0.95rem", marginTop: "0.6rem" }}>
          Indicator override (optional)
        </label>
        <select
          id="graph-override-select"
          className="select"
          value={overrideIndicatorId}
          onChange={(event) => onOverrideIndicatorChange(event.target.value)}
        >
          <option value="">
            Use recommendation{" "}
            {recommendation.candidateId
              ? `(${indicatorIndex.get(recommendation.candidateId)?.label ?? recommendation.candidateId} – ${recommendation.candidateId})`
              : "(none available)"}
          </option>
          {overrideSelectionMissing && overrideIndicatorId && (
            <option value={overrideIndicatorId}>
              {indicatorIndex.get(overrideIndicatorId)?.label ?? overrideIndicatorId} ({overrideIndicatorId}) — outside current filter
            </option>
          )}
          {overrideOptions.filtered.map((indicator) => {
            const competencyLabel =
              competencyLabelLookup.get(indicator.competencyId) ?? indicator.competencyId;
            const highlightLabel = overrideOptions.highlightSet.has(indicator.id)
              ? " — Highest difficulty"
              : "";
            return (
              <option key={indicator.id} value={indicator.id}>
                {`${indicator.label} (${indicator.id}) — ${competencyLabel}${highlightLabel}`}
              </option>
            );
          })}
        </select>
        {overrideOptions.filtered.length === 0 && (
          <p style={{ fontSize: "0.8rem", color: "#b91c1c", marginTop: "0.35rem" }}>
            No indicators match the current graph filters. Adjust the filters to find an override.
          </p>
        )}
        <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.35rem" }}>
          The override list respects the same subject, domain, and competency filters shown above so you
          can focus on a specific slice of the graph.
        </p>
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
      {noResults ? (
        <p className="graph-empty-state">
          No learning indicators match the selected filters.
        </p>
      ) : null}
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
              const difficulty = indicator?.difficulty ?? 0;
              const isSearchFocus = searchIndicatorId === pos.id;
              const isOverrideFocus = overrideIndicatorId === pos.id;
              const circleStroke = isSearchFocus
                ? "#f97316"
                : isOverrideFocus
                ? "#0ea5e9"
                : palette.stroke;
              const strokeWidth =
                isSearchFocus || isOverrideFocus || pos.id === targetId ? 3 : 2;

              return (
                <g
                  key={pos.id}
                  onMouseEnter={(event) => handleNodeEnter(event, pos.id)}
                  onMouseLeave={handleNodeLeave}
                >
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={NODE_RADIUS}
                    fill={palette.fill}
                    stroke={circleStroke}
                    strokeWidth={strokeWidth}
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
                  <text
                    x={pos.x}
                    y={pos.y + 42}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#64748b"
                  >
                    diff {difficulty.toFixed(2)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      {hoverSnapshot && hoverInfo
        ? (() => {
            const indicator = hoverSnapshot.indicator;
            const outcome = outcomeIndex.get(
              indicator.outcomeId
            );
            const competencyLabel =
              competencyLabelLookup.get(indicator.competencyId) ??
              indicator.competencyId;
            const subjectLabel =
              subjectLabelLookup.get(indicator.subjectId) ?? indicator.subjectId;
            const domainLabel =
              domainLabelLookup.get(indicator.domainId) ?? indicator.domainId;
            return (
              <div
                className="graph-tooltip"
                style={{
                  position: "absolute",
                  left: hoverInfo.x + 12,
                  top: hoverInfo.y + 12,
                  background: "#0f172a",
                  color: "white",
                  borderRadius: 8,
                  padding: "0.6rem 0.8rem",
                  fontSize: "0.75rem",
                  pointerEvents: "none",
                  maxWidth: 260,
                  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.3)",
                  zIndex: 10,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "0.8rem", marginBottom: 4 }}>
                  {indicator.label} ({indicator.id})
                </div>
                <div>θ indicator: {formatAbilityValue(hoverSnapshot.thetaIndicator)}</div>
                <div>
                  θ outcome: {formatAbilityValue(hoverSnapshot.thetaOutcome)} — {outcome?.label ?? indicator.outcomeId}
                </div>
                <div>
                  θ competency: {formatAbilityValue(hoverSnapshot.thetaCompetency)} — {competencyLabel}
                </div>
                <div>
                  θ subject: {formatAbilityValue(hoverSnapshot.thetaSubject)} — {subjectLabel}
                </div>
                <div>
                  θ domain: {formatAbilityValue(hoverSnapshot.thetaDomain)} — {domainLabel}
                </div>
                <div style={{ marginTop: 6 }}>
                  θ blend: {formatAbilityValue(hoverSnapshot.thetaBlend)}
                </div>
                <div>Probability: {formatProbabilityValue(hoverSnapshot.probability)}%</div>
              </div>
            );
          })()
        : null}
    </div>
  );
};

export default GraphDiagram;
