import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applyCoreConstantsCsv,
  buildGraphSnapshot,
  getCoreConstants,
  recommendNextIndicator,
  resetCoreConstants,
  updateAbilities,
  getIndicatorProbability,
  DEFAULT_ZPD_RANGE,
  DEFAULT_MASTERED_THRESHOLD,
  type AbilityState,
  type DependencyGraph,
  type GraphSnapshot,
  type RecommendationContext,
  type Indicator,
} from "@pal/core";
import GraphDiagram from "./components/GraphDiagram";
import {
  cloneAbilities,
  getDefaultDataset,
  loadDatasetFromCsv,
} from "./data/loaders";

interface AbilityVector {
  indicator: number;
  outcome: number;
  competency: number;
  subject: number;
  domain: number;
  grade: number;
}

interface HistoryEntry {
  indicatorId: string;
  label: string;
  correct: boolean;
  probabilityBefore: number;
  probabilityAfter: number;
  timestamp: number;
  thetaBefore: AbilityVector;
  thetaAfter: AbilityVector;
}

const getIndicatorLabel = (graph: DependencyGraph, id: string) =>
  graph.indicators.find((li) => li.id === id)?.label ?? id;

const formatAbility = (value: number | undefined) =>
  (value ?? 0).toFixed(2);

const formatProbability = (value: number | undefined) =>
  ((value ?? 0) * 100).toFixed(1);

const formatPercentChange = (before: number, after: number): string => {
  const base = Math.abs(before);
  const delta = after - before;
  if (base < 1e-6) {
    if (Math.abs(delta) < 1e-6) {
      return "+0.0%";
    }
    return "n/a";
  }
  const percent = (delta / base) * 100;
  const sign = percent >= 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
};

const formatStatusLabel = (
  status: RecommendationContext["status"]
): string =>
  status
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const formatConstant = (value: number): string => value.toFixed(2);

const ASSESSMENT_MASTERY_THETA = 3;
const ASSESSMENT_NON_MASTERY_THETA = -3;

const App = () => {
  const defaultDataset = useMemo(() => getDefaultDataset(), []);
  const [graph, setGraph] = useState<DependencyGraph>(defaultDataset.graph);
  const [abilities, setAbilities] = useState<AbilityState>(() =>
    cloneAbilities(defaultDataset.abilities)
  );
  const baselineAbilitiesRef = useRef<AbilityState>(
    cloneAbilities(defaultDataset.abilities)
  );
  // Selection policy controls how the demo picks a default target indicator.
  // Options: difficulty, lowest-probability, start-indicator, custom
  const [selectionPolicy, setSelectionPolicy] = useState<
    | "difficulty"
    | "lowest-probability"
    | "start-indicator"
    | "custom"
    | "zpd-prereq-aware"
  >("zpd-prereq-aware");

  const computeTargetForPolicy = (
    graph: DependencyGraph,
    abilities: AbilityState,
    policy:
      | "difficulty"
      | "lowest-probability"
    | "start-indicator"
    | "custom"
    | "zpd-prereq-aware"
  ,
    filters?: {
      gradeId?: string;
      subjectId?: string;
      domainId?: string;
      competencyId?: string;
    }
  ): string => {
    if (!graph || graph.indicators.length === 0) return "";
    const matchesFilter = (indicator: Indicator) => {
      if (filters?.gradeId && indicator.gradeId !== filters.gradeId) {
        return false;
      }
      if (filters?.subjectId && indicator.subjectId !== filters.subjectId) {
        return false;
      }
      if (filters?.domainId && indicator.domainId !== filters.domainId) {
        return false;
      }
      if (
        filters?.competencyId &&
        indicator.competencyId !== filters.competencyId
      ) {
        return false;
      }
      return true;
    };
    const filtered = graph.indicators.filter(matchesFilter);
    const indicatorPool =
      filtered.length > 0 ? filtered : graph.indicators.slice();
    if (indicatorPool.length === 0) {
      return "";
    }
    const selectByDifficulty = (pool: Indicator[]): string => {
      if (pool.length === 0) return "";
      const sorted = [...pool].sort(
        (a, b) => (b.difficulty ?? 0) - (a.difficulty ?? 0)
      );
      return sorted[0]?.id ?? pool[0].id;
    };
    const zpdRange = DEFAULT_ZPD_RANGE;
    const masteredThreshold = DEFAULT_MASTERED_THRESHOLD;

    switch (policy) {
      case "difficulty":
        return selectByDifficulty(indicatorPool);
      case "start-indicator": {
        const start =
          indicatorPool.find((indicator) => indicator.prerequisites.length === 0) ??
          indicatorPool[0];
        return start?.id ?? "";
      }
      case "lowest-probability": {
        let bestId = indicatorPool[0].id;
        let bestProb = Infinity;
        for (const ind of indicatorPool) {
          const p = getIndicatorProbability(graph, abilities, ind.id) ?? 0;
          if (p < bestProb) {
            bestProb = p;
            bestId = ind.id;
          }
        }
        return bestId;
      }
      case "zpd-prereq-aware": {
        // Compute probabilities and mastered/zpd status for all indicators.
        const probs = new Map<string, number>();
        const mastered = new Map<string, boolean>();
        const inZpd = new Map<string, boolean>();
        for (const ind of graph.indicators) {
          const p = getIndicatorProbability(graph, abilities, ind.id) ?? 0;
          probs.set(ind.id, p);
          mastered.set(ind.id, p >= masteredThreshold);
          inZpd.set(ind.id, p >= zpdRange[0] && p <= zpdRange[1]);
        }
        const indicatorSet = new Set(indicatorPool.map((ind) => ind.id));
        // Policy thresholds (uses defaults from core unless overridden)
        // Eligible indicators: all prerequisites mastered.
        const eligibleAll = indicatorPool.filter((ind) =>
          ind.prerequisites.every((pre) => mastered.get(pre) === true)
        );
        // Prefer eligible indicators that are not yet mastered themselves;
        // only fall back to already-mastered eligible indicators if there
        // are no non-mastered eligibles. This avoids repeatedly picking a
        // target that the student already appears to have mastered.
        let eligible = eligibleAll.filter((ind) => !mastered.get(ind.id));
        if (eligible.length === 0) eligible = eligibleAll.slice();

  // (debug logs removed)

        if (eligible.length > 0) {
          // Prefer those in ZPD and pick the one closest to the mastered
          // threshold (by absolute probability distance), tie-breaking by
          // higher probability.
          const zpdCandidates = eligible.filter((ind) => inZpd.get(ind.id));
          const chooseClosestToMasteredByProb = (arr: typeof eligible) => {
            let best = arr[0];
            const m = masteredThreshold;
            let bestScore = Math.abs((probs.get(best.id) ?? 0) - m);
            let bestP = probs.get(best.id) ?? 0;
            for (const ind of arr) {
              const p = probs.get(ind.id) ?? 0;
              const score = Math.abs(p - m);
              // prefer smaller distance to masteredThreshold; break ties by higher p
              if (score < bestScore || (score === bestScore && p > bestP)) {
                bestScore = score;
                bestP = p;
                best = ind;
              }
            }
            return best.id;
          };

          if (zpdCandidates.length > 0) {
            return chooseClosestToMasteredByProb(zpdCandidates);
          }

          // If no ZPD candidates, pick the eligible indicator that is
          // graph-closest to any mastered indicator (fewest forward edges),
          // tie-breaking by higher probability.
          const dependents = new Map<string, string[]>();
          for (const ind of indicatorPool) {
            for (const pre of ind.prerequisites) {
              if (!indicatorSet.has(pre)) {
                continue;
              }
              const list = dependents.get(pre) ?? [];
              list.push(ind.id);
              dependents.set(pre, list);
            }
          }

          const computeDistanceToMastered = (startId: string): number => {
            const queue: Array<{ id: string; dist: number }> = [];
            const seen = new Set<string>();
            const first = dependents.get(startId) ?? [];
            for (const d of first) {
              queue.push({ id: d, dist: 1 });
              seen.add(d);
            }
            while (queue.length > 0) {
              const { id, dist } = queue.shift()!;
              if (mastered.get(id)) return dist;
              const next = dependents.get(id) ?? [];
              for (const n of next) {
                if (!seen.has(n)) {
                  seen.add(n);
                  queue.push({ id: n, dist: dist + 1 });
                }
              }
            }
            return Number.POSITIVE_INFINITY;
          };

          eligible.sort((a, b) => {
            const da = computeDistanceToMastered(a.id);
            const db = computeDistanceToMastered(b.id);
            if (da !== db) return da - db;
            return (probs.get(b.id) ?? 0) - (probs.get(a.id) ?? 0);
          });
          return eligible[0].id;
        }

        // Fallback: if no eligible indicators (some prerequisites not mastered),
        // suggest unmet prerequisite nodes in this order:
        //  1) unmet prerequisites that are inside ZPD, ordered by descending
        //     probability (closest to mastered threshold first)
        //  2) unmet prerequisites below ZPD, ordered by descending probability
        //     (nearest remediation with highest chance first)
        const unmet = new Set<string>();
        for (const ind of indicatorPool) {
          for (const pre of ind.prerequisites) {
            if (!indicatorSet.has(pre)) continue;
            if (!mastered.get(pre)) unmet.add(pre);
          }
        }

        if (unmet.size > 0) {
        const unmetArr = Array.from(unmet);
        // Build dependents map (prereq -> dependents) for BFS distance calculations
        const dependents = new Map<string, string[]>();
        for (const ind of indicatorPool) {
          for (const pre of ind.prerequisites) {
            if (!indicatorSet.has(pre)) continue;
            const list = dependents.get(pre) ?? [];
            list.push(ind.id);
            dependents.set(pre, list);
          }
        }

          const nonMasteredTargets = new Set<string>();
          for (const ind of graph.indicators) {
            if (!mastered.get(ind.id)) nonMasteredTargets.add(ind.id);
          }

          const computeDistanceToNonMastered = (startId: string): number => {
            const queue: Array<{ id: string; dist: number }> = [];
            const seen = new Set<string>();
            const first = dependents.get(startId) ?? [];
            for (const d of first) {
              queue.push({ id: d, dist: 1 });
              seen.add(d);
            }
            while (queue.length > 0) {
              const { id, dist } = queue.shift()!;
              if (nonMasteredTargets.has(id)) return dist;
              const next = dependents.get(id) ?? [];
              for (const n of next) {
                if (!seen.has(n)) {
                  seen.add(n);
                  queue.push({ id: n, dist: dist + 1 });
                }
              }
            }
            return Number.POSITIVE_INFINITY;
          };

          const unmetInZpd = unmetArr.filter((id) => inZpd.get(id));
          if (unmetInZpd.length > 0) {
            // prefer nearest by graph distance; tie-break by higher probability
            unmetInZpd.sort((a, b) => {
              const da = computeDistanceToNonMastered(a);
              const db = computeDistanceToNonMastered(b);
              if (da !== db) return da - db;
              return (probs.get(b) ?? 0) - (probs.get(a) ?? 0);
            });
            return unmetInZpd[0];
          }

          const unmetBelow = unmetArr.filter((id) => !inZpd.get(id));
          if (unmetBelow.length > 0) {
            unmetBelow.sort((a, b) => {
              const da = computeDistanceToNonMastered(a);
              const db = computeDistanceToNonMastered(b);
              if (da !== db) return da - db;
              return (probs.get(b) ?? 0) - (probs.get(a) ?? 0);
            });
            return unmetBelow[0];
          }
        }

        // As a last resort, fall back to difficulty-based default.
        return selectByDifficulty(indicatorPool);
      }
      case "custom":
      default:
        // Custom leaves existing selection (handled by UI).
        return selectByDifficulty(indicatorPool);
    }
  };

  const [graphGradeFilterId, setGraphGradeFilterId] = useState<string>("");
  const [graphSubjectFilterId, setGraphSubjectFilterId] = useState<string>("");
  const [graphDomainFilterId, setGraphDomainFilterId] = useState<string>("");
  const [graphCompetencyFilterId, setGraphCompetencyFilterId] =
    useState<string>("");

  const [targetId, setTargetId] = useState<string>(() =>
    computeTargetForPolicy(
      defaultDataset.graph,
      baselineAbilitiesRef.current,
      "zpd-prereq-aware",
      {
        gradeId: graphGradeFilterId,
        subjectId: graphSubjectFilterId,
        domainId: graphDomainFilterId,
        competencyId: graphCompetencyFilterId,
      }
    )
  );

  useEffect(() => {
    // When graph or abilities change and the policy is not custom, recompute the
    // target to reflect the chosen policy (e.g., lowest-probability should
    // follow ability updates automatically).
    if (selectionPolicy !== "custom") {
      const newTarget = computeTargetForPolicy(
        graph,
        abilities,
        selectionPolicy,
        {
          gradeId: graphGradeFilterId,
          subjectId: graphSubjectFilterId,
          domainId: graphDomainFilterId,
          competencyId: graphCompetencyFilterId,
        }
      );
      setTargetId(newTarget);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectionPolicy,
    graph,
    abilities,
    graphGradeFilterId,
    graphSubjectFilterId,
    graphDomainFilterId,
    graphCompetencyFilterId,
  ]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedOutcome, setSelectedOutcome] = useState<"correct" | "incorrect">(
    "correct"
  );
  const [manualOutcomeIndicatorId, setManualOutcomeIndicatorId] =
    useState<string>("");
  const [assessmentGradeId, setAssessmentGradeId] = useState<string>("");
  const [assessmentDomainId, setAssessmentDomainId] = useState<string>("");
  const [assessmentSubjectId, setAssessmentSubjectId] = useState<string>("");
  const [assessmentCompetencyId, setAssessmentCompetencyId] =
    useState<string>("");
  const [assessmentOutcomeValues, setAssessmentOutcomeValues] = useState<
    Record<string, "" | "0" | "1">
  >({});
  const [assessmentOutcomeSearch, setAssessmentOutcomeSearch] =
    useState<string>("");
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [assessmentMessage, setAssessmentMessage] = useState<string | null>(null);
  const [assessmentRecommendations, setAssessmentRecommendations] = useState<
    Array<{
      competencyId: string;
      competencyLabel: string;
      indicators: Indicator[];
    }>
  >([]);
  const [uploadedGraphCsv, setUploadedGraphCsv] = useState<string | null>(null);
  const [uploadedPrereqCsv, setUploadedPrereqCsv] = useState<string | null>(null);
  const [uploadedAbilityCsv, setUploadedAbilityCsv] = useState<string | null>(null);
  const [uploadedConstantsCsv, setUploadedConstantsCsv] = useState<string | null>(
    null
  );
  const [dataError, setDataError] = useState<string | null>(null);
  const [constantsError, setConstantsError] = useState<string | null>(null);
  const [constantsSnapshot, setConstantsSnapshot] = useState(() =>
    getCoreConstants()
  );

  const recommendationGraph = useMemo(() => {
    if (
      !graphGradeFilterId &&
      !graphSubjectFilterId &&
      !graphDomainFilterId &&
      !graphCompetencyFilterId
    ) {
      return graph;
    }
    const filteredIndicators = graph.indicators.filter((indicator) => {
      if (graphGradeFilterId && indicator.gradeId !== graphGradeFilterId) {
        return false;
      }
      if (graphSubjectFilterId && indicator.subjectId !== graphSubjectFilterId) {
        return false;
      }
      if (graphDomainFilterId && indicator.domainId !== graphDomainFilterId) {
        return false;
      }
      if (
        graphCompetencyFilterId &&
        indicator.competencyId !== graphCompetencyFilterId
      ) {
        return false;
      }
      return true;
    });
    if (filteredIndicators.length === 0) {
      return graph;
    }
    const allowedIds = new Set(filteredIndicators.map((indicator) => indicator.id));
    const trimmedIndicators = filteredIndicators.map((indicator) => ({
      ...indicator,
      prerequisites: indicator.prerequisites.filter((pre) =>
        allowedIds.has(pre)
      ),
    }));
    const allowedGradeIds = new Set(
      trimmedIndicators.map((indicator) => indicator.gradeId)
    );
    const allowedSubjectIds = new Set(
      trimmedIndicators.map((indicator) => indicator.subjectId)
    );
    const allowedDomainIds = new Set(
      trimmedIndicators.map((indicator) => indicator.domainId)
    );
    const allowedCompetencyIds = new Set(
      trimmedIndicators.map((indicator) => indicator.competencyId)
    );
    const allowedOutcomeIds = new Set(
      trimmedIndicators.map((indicator) => indicator.outcomeId)
    );
    const filteredGraph: DependencyGraph = {
      startIndicatorId:
        trimmedIndicators.find((indicator) => indicator.prerequisites.length === 0)?.id ??
        trimmedIndicators[0].id,
      indicators: trimmedIndicators,
      grades: graph.grades.filter((grade) => allowedGradeIds.has(grade.id)),
      subjects: graph.subjects.filter((subject) =>
        allowedSubjectIds.has(subject.id)
      ),
      domains: graph.domains.filter((domain) =>
        allowedDomainIds.has(domain.id)
      ),
      competencies: graph.competencies.filter((competency) =>
        allowedCompetencyIds.has(competency.id)
      ),
      outcomes: graph.outcomes.filter((outcome) =>
        allowedOutcomeIds.has(outcome.id)
      ),
    };
    return filteredGraph;
  }, [
    graph,
    graphGradeFilterId,
    graphSubjectFilterId,
    graphDomainFilterId,
    graphCompetencyFilterId,
  ]);

  const recommendation: RecommendationContext = useMemo(
    () =>
      recommendNextIndicator({
        graph: recommendationGraph,
        abilities,
        targetIndicatorId: targetId,
      }),
    [abilities, recommendationGraph, targetId, constantsSnapshot]
  );

  const snapshot: GraphSnapshot = useMemo(
    () => buildGraphSnapshot(graph, abilities),
    [abilities, graph, constantsSnapshot]
  );

  const targetIndicator = useMemo(
    () => graph.indicators.find((li) => li.id === targetId),
    [graph, targetId]
  );

  const manualIndicator = useMemo(
    () =>
      graph.indicators.find((li) => li.id === manualOutcomeIndicatorId),
    [graph, manualOutcomeIndicatorId]
  );

  const indicatorsByOutcome = useMemo(() => {
    const map = new Map<string, Indicator[]>();
    for (const indicator of graph.indicators) {
      const list = map.get(indicator.outcomeId) ?? [];
      list.push(indicator);
      map.set(indicator.outcomeId, list);
    }
    return map;
  }, [graph]);

  const subjectsByGrade = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const subject of graph.subjects) {
      const list = map.get(subject.gradeId) ?? [];
      list.push(subject.id);
      map.set(subject.gradeId, list);
    }
    return map;
  }, [graph]);

  const competenciesByGrade = useMemo(() => {
    const interim = new Map<string, Set<string>>();
    for (const indicator of graph.indicators) {
      const list = interim.get(indicator.gradeId) ?? new Set<string>();
      list.add(indicator.competencyId);
      interim.set(indicator.gradeId, list);
    }
    const normalized = new Map<string, string[]>();
    for (const [gradeId, set] of interim.entries()) {
      normalized.set(gradeId, Array.from(set));
    }
    return normalized;
  }, [graph]);

  const domainsByGrade = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const domain of graph.domains) {
      const list = map.get(domain.gradeId) ?? [];
      list.push(domain.id);
      map.set(domain.gradeId, list);
    }
    return map;
  }, [graph]);

  const domainsBySubject = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const domain of graph.domains) {
      const list = map.get(domain.subjectId) ?? [];
      list.push(domain.id);
      map.set(domain.subjectId, list);
    }
    return map;
  }, [graph]);

  const outcomesByGrade = useMemo(() => {
    const interim = new Map<string, Set<string>>();
    for (const indicator of graph.indicators) {
      const list = interim.get(indicator.gradeId) ?? new Set<string>();
      list.add(indicator.outcomeId);
      interim.set(indicator.gradeId, list);
    }
    const normalized = new Map<string, string[]>();
    for (const [gradeId, set] of interim.entries()) {
      normalized.set(gradeId, Array.from(set));
    }
    return normalized;
  }, [graph]);

  const outcomesBySubject = useMemo(() => {
    const interim = new Map<string, Set<string>>();
    for (const indicator of graph.indicators) {
      const list = interim.get(indicator.subjectId) ?? new Set<string>();
      list.add(indicator.outcomeId);
      interim.set(indicator.subjectId, list);
    }
    const normalized = new Map<string, string[]>();
    for (const [subjectId, set] of interim.entries()) {
      normalized.set(subjectId, Array.from(set));
    }
    return normalized;
  }, [graph]);

  const competenciesByDomain = useMemo(() => {
    const interim = new Map<string, Set<string>>();
    for (const indicator of graph.indicators) {
      const set = interim.get(indicator.domainId) ?? new Set<string>();
      set.add(indicator.competencyId);
      interim.set(indicator.domainId, set);
    }
    const normalized = new Map<string, string[]>();
    for (const [domainId, set] of interim.entries()) {
      normalized.set(domainId, Array.from(set));
    }
    return normalized;
  }, [graph]);

  const outcomesByDomain = useMemo(() => {
    const interim = new Map<string, Set<string>>();
    for (const indicator of graph.indicators) {
      const set = interim.get(indicator.domainId) ?? new Set<string>();
      set.add(indicator.outcomeId);
      interim.set(indicator.domainId, set);
    }
    const normalized = new Map<string, string[]>();
    for (const [domainId, set] of interim.entries()) {
      normalized.set(domainId, Array.from(set));
    }
    return normalized;
  }, [graph]);

  const assessmentCompetencyOptions = useMemo(() => {
    let pool = graph.competencies;
    if (assessmentGradeId) {
      const allowedByGrade = new Set(
        competenciesByGrade.get(assessmentGradeId) ?? []
      );
      pool = pool.filter((competency) =>
        allowedByGrade.has(competency.id)
      );
    }
    if (assessmentSubjectId) {
      pool = pool.filter(
        (competency) => competency.subjectId === assessmentSubjectId
      );
    }
    if (assessmentDomainId) {
      const allowedByDomain = new Set(
        competenciesByDomain.get(assessmentDomainId) ?? []
      );
      pool = pool.filter((competency) =>
        allowedByDomain.has(competency.id)
      );
    }
    return pool;
  }, [
    graph,
    assessmentGradeId,
    assessmentSubjectId,
    assessmentDomainId,
    competenciesByGrade,
    competenciesByDomain,
  ]);

  const assessmentSubjectOptions = useMemo(() => {
    if (!assessmentGradeId) {
      return graph.subjects;
    }
    const allowed = new Set(subjectsByGrade.get(assessmentGradeId) ?? []);
    return graph.subjects.filter((subject) => allowed.has(subject.id));
  }, [graph, assessmentGradeId, subjectsByGrade]);

  const assessmentDomainOptions = useMemo(() => {
    let pool = graph.domains;
    if (assessmentGradeId) {
      const allowed = new Set(domainsByGrade.get(assessmentGradeId) ?? []);
      pool = pool.filter((domain) => allowed.has(domain.id));
    }
    if (assessmentSubjectId) {
      const allowedBySubject = new Set(
        domainsBySubject.get(assessmentSubjectId) ?? []
      );
      pool = pool.filter((domain) => allowedBySubject.has(domain.id));
    }
    return pool;
  }, [graph, assessmentGradeId, assessmentSubjectId, domainsByGrade, domainsBySubject]);

  const assessmentOutcomeOptions = useMemo(() => {
    let filtered = graph.outcomes;
    if (assessmentCompetencyId) {
      filtered = filtered.filter(
        (outcome) => outcome.competencyId === assessmentCompetencyId
      );
    }
    if (assessmentGradeId) {
      const allowedOutcomeIds = new Set(
        outcomesByGrade.get(assessmentGradeId) ?? []
      );
      filtered = filtered.filter((outcome) =>
        allowedOutcomeIds.has(outcome.id)
      );
    }
    if (assessmentSubjectId) {
      const allowedOutcomeIds = new Set(
        outcomesBySubject.get(assessmentSubjectId) ?? []
      );
      filtered = filtered.filter((outcome) =>
        allowedOutcomeIds.has(outcome.id)
      );
    }
    if (assessmentDomainId) {
      const allowedOutcomeIds = new Set(
        outcomesByDomain.get(assessmentDomainId) ?? []
      );
      filtered = filtered.filter((outcome) =>
        allowedOutcomeIds.has(outcome.id)
      );
    }
    return filtered;
  }, [
    graph,
    assessmentDomainId,
    assessmentCompetencyId,
    assessmentGradeId,
    assessmentSubjectId,
    outcomesByGrade,
    outcomesBySubject,
    outcomesByDomain,
  ]);

  const filteredAssessmentOutcomeOptions = useMemo(() => {
    const query = assessmentOutcomeSearch.trim().toLowerCase();
    if (!query) {
      return assessmentOutcomeOptions;
    }
    return assessmentOutcomeOptions.filter((outcome) => {
      const haystack = `${outcome.label} ${outcome.id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [assessmentOutcomeOptions, assessmentOutcomeSearch]);

  useEffect(() => {
    setAssessmentSubjectId("");
    setAssessmentDomainId("");
    setAssessmentCompetencyId("");
    setAssessmentOutcomeValues({});
    setAssessmentOutcomeSearch("");
  }, [assessmentGradeId]);

  useEffect(() => {
    setAssessmentDomainId("");
    setAssessmentCompetencyId("");
    setAssessmentOutcomeValues({});
    setAssessmentOutcomeSearch("");
  }, [assessmentSubjectId]);

  useEffect(() => {
    setAssessmentCompetencyId("");
    setAssessmentOutcomeValues({});
    setAssessmentOutcomeSearch("");
  }, [assessmentDomainId]);

  useEffect(() => {
    setAssessmentOutcomeValues({});
    setAssessmentOutcomeSearch("");
  }, [assessmentCompetencyId]);


  const applyAssessmentOutcomes = useCallback(
    (updates: { mastered: string[]; notMastered: string[] }): AbilityState => {
      const updated = cloneAbilities(abilities);
      const visited = new Set<string>();
      const indicatorIndex = new Map(
        graph.indicators.map((indicator) => [indicator.id, indicator])
      );
      const competencyStatus = new Map<
        string,
        { mastered: boolean; notMastered: boolean }
      >();
      const domainStatus = new Map<
        string,
        { mastered: boolean; notMastered: boolean }
      >();
      const subjectStatus = new Map<
        string,
        { mastered: boolean; notMastered: boolean }
      >();
      const gradeStatus = new Map<
        string,
        { mastered: boolean; notMastered: boolean }
      >();

      const noteStatus = (indicator: Indicator, mastered: boolean) => {
        const competencyEntry =
          competencyStatus.get(indicator.competencyId) ?? {
            mastered: false,
            notMastered: false,
          };
        if (mastered) {
          competencyEntry.mastered = true;
        } else {
          competencyEntry.notMastered = true;
        }
        competencyStatus.set(indicator.competencyId, competencyEntry);

        const domainEntry =
          domainStatus.get(indicator.domainId) ?? {
            mastered: false,
            notMastered: false,
          };
        if (mastered) {
          domainEntry.mastered = true;
        } else {
          domainEntry.notMastered = true;
        }
        domainStatus.set(indicator.domainId, domainEntry);

        const subjectEntry =
          subjectStatus.get(indicator.subjectId) ?? {
            mastered: false,
            notMastered: false,
          };
        if (mastered) {
          subjectEntry.mastered = true;
        } else {
          subjectEntry.notMastered = true;
        }
        subjectStatus.set(indicator.subjectId, subjectEntry);

        const gradeEntry = gradeStatus.get(indicator.gradeId) ?? {
          mastered: false,
          notMastered: false,
        };
        if (mastered) {
          gradeEntry.mastered = true;
        } else {
          gradeEntry.notMastered = true;
        }
        gradeStatus.set(indicator.gradeId, gradeEntry);
      };

      const markMasteredIndicator = (indicatorId: string) => {
        const indicator = indicatorIndex.get(indicatorId);
        if (!indicator) {
          return;
        }
        if (visited.has(indicatorId)) {
          return;
        }
        visited.add(indicatorId);
        updated.indicator[indicatorId] = ASSESSMENT_MASTERY_THETA;
        updated.outcome[indicator.outcomeId] = ASSESSMENT_MASTERY_THETA;
        noteStatus(indicator, true);
        for (const prereq of indicator.prerequisites) {
          markMasteredIndicator(prereq);
        }
      };

      const markNotMasteredIndicator = (indicatorId: string) => {
        const indicator = indicatorIndex.get(indicatorId);
        if (!indicator) {
          return;
        }
        updated.indicator[indicatorId] = ASSESSMENT_NON_MASTERY_THETA;
        updated.outcome[indicator.outcomeId] =
          ASSESSMENT_NON_MASTERY_THETA;
        noteStatus(indicator, false);
      };

      for (const outcomeId of updates.notMastered) {
        const indicators = indicatorsByOutcome.get(outcomeId) ?? [];
        if (indicators.length === 0) {
          updated.outcome[outcomeId] = ASSESSMENT_NON_MASTERY_THETA;
        }
        for (const indicator of indicators) {
          markNotMasteredIndicator(indicator.id);
        }
      }

      for (const outcomeId of updates.mastered) {
        updated.outcome[outcomeId] = ASSESSMENT_MASTERY_THETA;
        const indicators = indicatorsByOutcome.get(outcomeId) ?? [];
        for (const indicator of indicators) {
          markMasteredIndicator(indicator.id);
        }
      }

      for (const [competencyId, status] of competencyStatus.entries()) {
        if (status.notMastered) {
          updated.competency[competencyId] = ASSESSMENT_NON_MASTERY_THETA;
        } else if (status.mastered) {
          updated.competency[competencyId] = ASSESSMENT_MASTERY_THETA;
        }
      }

      for (const [domainId, status] of domainStatus.entries()) {
        if (status.notMastered) {
          updated.domain[domainId] = ASSESSMENT_NON_MASTERY_THETA;
        } else if (status.mastered) {
          updated.domain[domainId] = ASSESSMENT_MASTERY_THETA;
        }
      }

      for (const [subjectId, status] of subjectStatus.entries()) {
        if (status.notMastered) {
          updated.subject[subjectId] = ASSESSMENT_NON_MASTERY_THETA;
        } else if (status.mastered) {
          updated.subject[subjectId] = ASSESSMENT_MASTERY_THETA;
        }
      }

      for (const [gradeId, status] of gradeStatus.entries()) {
        if (status.notMastered) {
          updated.grade[gradeId] = ASSESSMENT_NON_MASTERY_THETA;
        } else if (status.mastered) {
          updated.grade[gradeId] = ASSESSMENT_MASTERY_THETA;
        }
      }

      return updated;
    },
    [abilities, graph, indicatorsByOutcome]
  );

  const computeCompetencyAdvancement = useCallback(
    (currentAbilities: AbilityState, competencyFilter?: string) => {
      const results = new Map<
        string,
        { competencyId: string; competencyLabel: string; indicators: Indicator[] }
      >();
      for (const indicator of graph.indicators) {
        if (competencyFilter && indicator.competencyId !== competencyFilter) {
          continue;
        }
        const prerequisitesMastered = indicator.prerequisites.every((pre) => {
          const prob =
            getIndicatorProbability(graph, currentAbilities, pre) ?? 0;
          return prob >= DEFAULT_MASTERED_THRESHOLD;
        });
        const indicatorMastered =
          (getIndicatorProbability(graph, currentAbilities, indicator.id) ?? 0) >=
          DEFAULT_MASTERED_THRESHOLD;
        if (prerequisitesMastered && !indicatorMastered) {
          const competency =
            graph.competencies.find((comp) => comp.id === indicator.competencyId)
              ?.label ?? indicator.competencyId;
          const entry =
            results.get(indicator.competencyId) ??
            {
              competencyId: indicator.competencyId,
              competencyLabel: competency,
              indicators: [],
            };
          entry.indicators.push(indicator);
          results.set(indicator.competencyId, entry);
        }
      }
      const sorted = Array.from(results.values()).map((entry) => ({
        ...entry,
        indicators: [...entry.indicators].sort(
          (a, b) => (a.difficulty ?? 0) - (b.difficulty ?? 0)
        ),
      }));
      sorted.sort((a, b) => a.competencyLabel.localeCompare(b.competencyLabel));
      return sorted;
    },
    [graph]
  );

  // Allow recording when we have a recommendation candidate or the user
  // explicitly picks a manual indicator override.
  const canRecord = Boolean(recommendation.candidateId || manualIndicator);

  const activeLoggingIndicatorId =
    manualIndicator?.id ?? recommendation.candidateId ?? "";
  const activeLoggingIndicatorLabel = activeLoggingIndicatorId
    ? `${getIndicatorLabel(graph, activeLoggingIndicatorId)} (${activeLoggingIndicatorId})`
    : "None selected";

  const resetAbilitiesToBaseline = () => {
    const clone = cloneAbilities(baselineAbilitiesRef.current);
    setAbilities(clone);
  };

  const handleRecordOutcome = () => {
    const indicatorId =
      manualIndicator?.id ?? recommendation.candidateId;
    if (!indicatorId) {
      return;
    }
    const timestamp = Date.now();
    const correct = selectedOutcome === "correct";
    const resolvedIndicator =
      manualIndicator ??
      graph.indicators.find((li) => li.id === indicatorId);
    if (!resolvedIndicator) {
      return;
    }
    const outcomeId = resolvedIndicator.outcomeId;
    const competencyId = resolvedIndicator.competencyId;
    const subjectId = resolvedIndicator.subjectId;
    const domainId = resolvedIndicator.domainId;
    const gradeId = resolvedIndicator.gradeId;
    const label = resolvedIndicator.label ?? indicatorId;
    const result = updateAbilities({
      graph,
      abilities,
      event: {
        indicatorId,
        correct,
        timestamp,
      },
    });
    const thetaBefore: AbilityVector = {
      indicator: abilities.indicator[indicatorId] ?? 0,
      outcome: abilities.outcome[outcomeId] ?? 0,
      competency: abilities.competency[competencyId] ?? 0,
      subject: abilities.subject[subjectId] ?? 0,
      domain: abilities.domain[domainId] ?? 0,
      grade: abilities.grade[gradeId] ?? 0,
    };
    const thetaAfter: AbilityVector = {
      indicator: result.abilities.indicator[indicatorId] ?? 0,
      outcome: result.abilities.outcome[outcomeId] ?? 0,
      competency: result.abilities.competency[competencyId] ?? 0,
      subject: result.abilities.subject[subjectId] ?? 0,
      domain: result.abilities.domain[domainId] ?? 0,
      grade: result.abilities.grade[gradeId] ?? 0,
    };
    setAbilities(result.abilities);
    setHistory((prevHistory) => [
      {
        indicatorId,
        label,
        correct,
        probabilityBefore: result.probabilityBefore,
        probabilityAfter: result.probabilityAfter,
        timestamp,
        thetaBefore,
        thetaAfter,
      },
      ...prevHistory,
    ]);
  };

  const handleApplyAssessment = () => {
    const entries = Object.entries(assessmentOutcomeValues);
    if (entries.length === 0) {
      setAssessmentError("Enter 0 or 1 for at least one learning outcome.");
      setAssessmentMessage(null);
      return;
    }
    const mastered = entries
      .filter(([, value]) => value === "1")
      .map(([id]) => id);
    const notMastered = entries
      .filter(([, value]) => value === "0")
      .map(([id]) => id);
    if (mastered.length === 0 && notMastered.length === 0) {
      setAssessmentError("Enter 0 or 1 for at least one learning outcome.");
      setAssessmentMessage(null);
      return;
    }

    const updatedAbilities = applyAssessmentOutcomes({
      mastered,
      notMastered,
    });
    setAbilities(updatedAbilities);
    const forwardTargets = computeCompetencyAdvancement(
      updatedAbilities,
      assessmentCompetencyId || undefined
    );
    setAssessmentRecommendations(forwardTargets);
    setAssessmentError(null);
    setAssessmentMessage(
      `Assessment applied to ${entries.length} learning outcome${
        entries.length === 1 ? "" : "s"
      } (${mastered.length} mastered, ${notMastered.length} not mastered).`
    );
    setAssessmentOutcomeValues({});
  };

  const setAssessmentOutcomeValue = (
    outcomeId: string,
    value: "" | "0" | "1"
  ) => {
    setAssessmentOutcomeValues((prev) => {
      const next = { ...prev };
      if (value === "") {
        delete next[outcomeId];
      } else {
        next[outcomeId] = value;
      }
      return next;
    });
  };

  const handleReset = () => {
    resetAbilitiesToBaseline();
    setHistory([]);
    setSelectedOutcome("correct");
    setManualOutcomeIndicatorId("");
  };

  const applyDataset = (dataset: {
    graph: DependencyGraph;
    abilities: AbilityState;
  }) => {
    setGraph(dataset.graph);
    const abilityClone = cloneAbilities(dataset.abilities);
    setAbilities(abilityClone);
    baselineAbilitiesRef.current = cloneAbilities(dataset.abilities);
    setHistory([]);
    setSelectedOutcome("correct");
    setManualOutcomeIndicatorId("");
    setGraphGradeFilterId("");
    setGraphSubjectFilterId("");
    setGraphDomainFilterId("");
    setGraphCompetencyFilterId("");
    const newTarget = computeTargetForPolicy(
      dataset.graph,
      baselineAbilitiesRef.current,
      selectionPolicy,
      {
        gradeId: "",
        subjectId: "",
        domainId: "",
        competencyId: "",
      }
    );
    setTargetId(newTarget);
    setConstantsSnapshot(getCoreConstants());
  };

  const handleRestoreDefault = () => {
    applyDataset(getDefaultDataset());
    setUploadedGraphCsv(null);
    setUploadedPrereqCsv(null);
    setUploadedAbilityCsv(null);
    setUploadedConstantsCsv(null);
    setDataError(null);
    setConstantsError(null);
    setManualOutcomeIndicatorId("");
  };

  const handleApplyUploaded = () => {
    if (!uploadedGraphCsv || !uploadedPrereqCsv) {
      setDataError("Please provide both the graph and prerequisite CSV files.");
      return;
    }
    try {
      const dataset = loadDatasetFromCsv({
        graphCsv: uploadedGraphCsv,
        prerequisitesCsv: uploadedPrereqCsv,
        abilityCsv: uploadedAbilityCsv ?? undefined,
      });
      applyDataset(dataset);
      setDataError(null);
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
      : "Unable to parse the uploaded CSV files."
      );
    }
  };

  const handleApplyConstants = () => {
    if (!uploadedConstantsCsv) {
      setConstantsError("Please upload a constants CSV file to apply.");
      return;
    }
    try {
      applyCoreConstantsCsv(uploadedConstantsCsv);
      setConstantsSnapshot(getCoreConstants());
      setConstantsError(null);
    } catch (error) {
      setConstantsError(
        error instanceof Error
          ? error.message
          : "Unable to parse the constants CSV file."
      );
    }
  };

  const handleResetConstants = () => {
    resetCoreConstants();
    setConstantsSnapshot(getCoreConstants());
    setUploadedConstantsCsv(null);
    setConstantsError(null);
  };

  const handleFileUpload =
    (setter: (content: string | null) => void) =>
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const { files } = input;
      if (!files || files.length === 0) {
        setter(null);
        return;
      }
      const file = files[0];
      const text = await file.text();
      setter(text);
      input.value = "";
    };

  const computeThetaBlend = (
    indicator: (typeof graph.indicators)[number],
    abilityState: AbilityState
  ): number => {
    const weights = constantsSnapshot.blendWeights;
    const thetaIndicator = abilityState.indicator[indicator.id] ?? 0;
    const thetaOutcome =
      abilityState.outcome[indicator.outcomeId] ?? 0;
    const thetaCompetency =
      abilityState.competency[indicator.competencyId] ?? 0;
    const thetaDomain = abilityState.domain[indicator.domainId] ?? 0;
    const thetaGrade = abilityState.grade[indicator.gradeId] ?? 0;
    return (
      thetaIndicator * weights.indicator +
      thetaOutcome * weights.outcome +
      thetaCompetency * weights.competency +
      thetaDomain * weights.domain +
      thetaGrade * weights.grade
    );
  };

  const renderAbilitySnapshot = (
    indicator: (typeof graph.indicators)[number] | undefined,
    heading: string,
    size: "default" | "compact" = "default"
  ) => {
    if (!indicator) return null;
    const outcome = graph.outcomes.find(
      (lo) => lo.id === indicator.outcomeId
    );
    const competency = graph.competencies.find(
      (comp) => comp.id === indicator.competencyId
    );
    const subject = graph.subjects.find((item) => item.id === indicator.subjectId);
    const domain = graph.domains.find((item) => item.id === indicator.domainId);
    const grade = graph.grades.find((item) => item.id === indicator.gradeId);
    const fontSize = size === "compact" ? "0.85rem" : "0.9rem";
    const thetaBlend = computeThetaBlend(indicator, abilities);
    const probability = getIndicatorProbability(
      graph,
      abilities,
      indicator.id,
      constantsSnapshot.blendWeights
    );
    return (
      <div
        className={size === "default" ? "section" : ""}
        style={size === "compact" ? { marginTop: "0.5rem" } : undefined}
      >
        <h3>{heading}</h3>
        <div style={{ display: "grid", gap: "0.4rem", fontSize }}>
          <div>
            <strong>Indicator</strong>
            <div>
              {indicator.label} ({indicator.id}) — θ=
              {formatAbility(abilities.indicator[indicator.id])}
            </div>
          </div>
          <div>
            <strong>Learning Outcome</strong>
            <div>
              {outcome?.label ?? indicator.outcomeId} — θ=
              {formatAbility(abilities.outcome[indicator.outcomeId])}
            </div>
          </div>
          <div>
            <strong>Competency</strong>
            <div>
              {competency?.label ?? indicator.competencyId} — θ=
              {formatAbility(abilities.competency[indicator.competencyId])}
            </div>
          </div>
          <div>
            <strong>Subject</strong>
            <div>
              {subject?.label ?? indicator.subjectId} — θ=
              {formatAbility(abilities.subject[indicator.subjectId])}
            </div>
          </div>
          <div>
            <strong>Domain</strong>
            <div>
              {domain?.label ?? indicator.domainId} — θ=
              {formatAbility(abilities.domain[indicator.domainId])}
            </div>
          </div>
          <div>
            <strong>Grade Prior</strong>
            <div>
              {grade?.label ?? indicator.gradeId} — θ=
              {formatAbility(abilities.grade[indicator.gradeId])}
            </div>
          </div>
          <div>
            <strong>θ blend</strong>
            <div>{formatAbility(thetaBlend)}</div>
          </div>
          <div>
            <strong>Probability</strong>
            <div>{formatProbability(probability)}%</div>
          </div>
        </div>
      </div>
    );
  };
  const abilityPanel = renderAbilitySnapshot(targetIndicator, "Ability Snapshot");

  return (
    <div className="app-shell">
      <div className="panel scroller">
        <h2>PAL Diagnostic Controller</h2>
        <p style={{ marginTop: 0, fontSize: "0.9rem", color: "#475569" }}>
          Tune outcomes to observe the adaptive recommendation engine update
          live. The recommendation surfaces the next Learning Indicator in the
          Zone of Proximal Development (ZPD).
        </p>

        <div className="section">
          <h3>Dataset</h3>
          <div className="input-group" style={{ gap: "0.75rem" }}>
            <label htmlFor="graph-csv">Graph CSV</label>
            <input
              id="graph-csv"
              className="select"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload(setUploadedGraphCsv)}
            />
            <label htmlFor="prereq-csv">Prerequisites CSV</label>
            <input
              id="prereq-csv"
              className="select"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload(setUploadedPrereqCsv)}
            />
            <label htmlFor="ability-csv">Abilities CSV (optional)</label>
            <input
              id="ability-csv"
              className="select"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload(setUploadedAbilityCsv)}
            />
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="btn" onClick={handleApplyUploaded}>
                Apply uploaded CSVs
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={handleRestoreDefault}
              >
                Restore sample data
              </button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
              Graph CSV format: gradeId, gradeLabel, subjectId, subjectName,
              domainId, domainName, competencyId, competencyName, outcomeId,
              outcomeName, indicatorId, indicatorName, difficulty.
              Prerequisites CSV format: sourceIndicatorId, targetIndicatorId.
              Abilities CSV format: type, id, ability.
            </p>
            {dataError && (
              <p style={{ fontSize: "0.82rem", color: "#b91c1c" }}>{dataError}</p>
            )}
          </div>
        </div>

        <div className="section">
          <h3>Assessment Module</h3>
          <p style={{ marginTop: 0, fontSize: "0.85rem", color: "#475569" }}>
            Mark learning outcomes as mastered after an assessment. All prerequisite indicators
            and outcomes will be considered mastered, and new targets are surfaced per competency.
          </p>
          <div className="input-group">
            <label htmlFor="assessment-grade">Grade</label>
            <select
              id="assessment-grade"
              className="select"
              value={assessmentGradeId}
              onChange={(event) => setAssessmentGradeId(event.target.value)}
            >
              <option value="">All grades</option>
              {graph.grades.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.label}
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label htmlFor="assessment-subject">Subject</label>
            <select
              id="assessment-subject"
              className="select"
              value={assessmentSubjectId}
              onChange={(event) => setAssessmentSubjectId(event.target.value)}
            >
              <option value="">All subjects</option>
              {assessmentSubjectOptions.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.label}
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label htmlFor="assessment-domain">Domain</label>
            <select
              id="assessment-domain"
              className="select"
              value={assessmentDomainId}
              onChange={(event) => setAssessmentDomainId(event.target.value)}
            >
              <option value="">All domains</option>
              {assessmentDomainOptions.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.label}
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label htmlFor="assessment-competency">Competency</label>
            <select
              id="assessment-competency"
              className="select"
              value={assessmentCompetencyId}
              onChange={(event) => setAssessmentCompetencyId(event.target.value)}
            >
              <option value="">All competencies</option>
              {assessmentCompetencyOptions.map((competency) => (
                <option key={competency.id} value={competency.id}>
                  {competency.label}
                </option>
              ))}
            </select>
          </div>
          <div className="input-group" style={{ flexDirection: "column" }}>
            <label>Learning outcomes to snap as mastered</label>
            <input
              type="text"
              className="input"
              placeholder="Search by name or ID"
              value={assessmentOutcomeSearch}
              onChange={(event) => setAssessmentOutcomeSearch(event.target.value)}
              style={{ marginBottom: "0.75rem" }}
            />
            <div
              style={{
                maxHeight: 180,
                overflowY: "auto",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "0.75rem",
                display: "grid",
                gap: "0.5rem",
              }}
            >
              {assessmentOutcomeOptions.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: 0 }}>
                  No learning outcomes available for the selected competency.
                </p>
              ) : filteredAssessmentOutcomeOptions.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: 0 }}>
                  No learning outcomes match your search.
                </p>
              ) : (
                filteredAssessmentOutcomeOptions.map((outcome) => (
                  <div
                    key={outcome.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ fontSize: "0.85rem" }}>
                      <div style={{ fontWeight: 500 }}>{outcome.label}</div>
                      <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        {outcome.id}
                      </div>
                    </div>
                    <select
                      className="select"
                      style={{ width: "90px" }}
                      value={assessmentOutcomeValues[outcome.id] ?? ""}
                      onChange={(event) =>
                        setAssessmentOutcomeValue(
                          outcome.id,
                          event.target.value as "" | "0" | "1"
                        )
                      }
                    >
                      <option value="">--</option>
                      <option value="1">1 (Mastered)</option>
                      <option value="0">0 (Not mastered)</option>
                    </select>
                  </div>
                ))
              )}
            </div>
            <p style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.4rem" }}>
              Use 1 for mastered and 0 for not mastered. Leave blank to skip an outcome.
            </p>
          </div>
          <button
            className="btn"
            type="button"
            style={{ width: "100%" }}
            onClick={handleApplyAssessment}
          >
            Apply assessment snapshot
          </button>
          {assessmentError && (
            <p style={{ fontSize: "0.8rem", color: "#b91c1c", marginTop: "0.5rem" }}>
              {assessmentError}
            </p>
          )}
          {assessmentMessage && (
            <p style={{ fontSize: "0.8rem", color: "#15803d", marginTop: "0.5rem" }}>
              {assessmentMessage}
            </p>
          )}
          {assessmentRecommendations.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <strong>Next targets per competency</strong>
              <ul style={{ marginTop: "0.5rem", paddingLeft: "1rem", color: "#475569" }}>
                {assessmentRecommendations.map((entry) => (
                  <li key={entry.competencyId} style={{ marginBottom: "0.5rem" }}>
                    <div style={{ fontWeight: 600 }}>{entry.competencyLabel}</div>
                    {entry.indicators.length === 0 ? (
                      <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                        All indicators mastered.
                      </div>
                    ) : (
                      <ul style={{ margin: "0.25rem 0 0 1rem" }}>
                        {entry.indicators.map((indicator) => (
                          <li key={indicator.id} style={{ fontSize: "0.8rem" }}>
                            {indicator.label} ({indicator.id})
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="section">
          <h3>Constants</h3>
          <div className="input-group" style={{ gap: "0.75rem" }}>
            <label htmlFor="constants-csv">Core constants CSV</label>
            <input
              id="constants-csv"
              className="select"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload(setUploadedConstantsCsv)}
            />
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn"
                onClick={handleApplyConstants}
              >
                Apply constants
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={handleResetConstants}
              >
                Reset to defaults
              </button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
              Expected columns: category,key,value. Categories include
              blendWeights, learningRates, zpdRange (min/max),
              masteredThreshold, and scale.
            </p>
            {constantsError && (
              <p style={{ fontSize: "0.82rem", color: "#b91c1c" }}>
                {constantsError}
              </p>
            )}
            <div
              style={{
                fontSize: "0.82rem",
                color: "#475569",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "0.6rem",
              }}
            >
              <strong>Current constants</strong>
              <div>
                Blend weights — indicator {formatConstant(constantsSnapshot.blendWeights.indicator)},
                outcome {formatConstant(constantsSnapshot.blendWeights.outcome)},
                competency {formatConstant(constantsSnapshot.blendWeights.competency)},
                domain {formatConstant(constantsSnapshot.blendWeights.domain)},
                subject {formatConstant(constantsSnapshot.blendWeights.subject)},
                grade {formatConstant(constantsSnapshot.blendWeights.grade)}
              </div>
              <div>
                Learning rates — indicator {formatConstant(constantsSnapshot.learningRates.indicator)},
                outcome {formatConstant(constantsSnapshot.learningRates.outcome)},
                competency {formatConstant(constantsSnapshot.learningRates.competency)},
                domain {formatConstant(constantsSnapshot.learningRates.domain)},
                subject {formatConstant(constantsSnapshot.learningRates.subject)},
                grade {formatConstant(constantsSnapshot.learningRates.grade)}
              </div>
              <div>
                ZPD range — {formatConstant(constantsSnapshot.zpdRange[0])} to {formatConstant(constantsSnapshot.zpdRange[1])}
              </div>
              <div>Mastered threshold — {formatConstant(constantsSnapshot.masteredThreshold)}</div>
              <div>Scale — {formatConstant(constantsSnapshot.scale)}</div>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="input-group">
            <label htmlFor="policy-select">Selection policy</label>
            <select
              id="policy-select"
              className="select"
              value={selectionPolicy}
              onChange={(event) => {
                const policy = event.target.value as
                  | "difficulty"
                  | "lowest-probability"
                  | "start-indicator"
                  | "custom"
                  | "zpd-prereq-aware";
                setSelectionPolicy(policy);
                if (policy !== "custom") {
                  const newTarget = computeTargetForPolicy(
                    graph,
                    abilities,
                    policy,
                    {
                      gradeId: graphGradeFilterId,
                      subjectId: graphSubjectFilterId,
                      domainId: graphDomainFilterId,
                      competencyId: graphCompetencyFilterId,
                    }
                  );
                  setTargetId(newTarget);
                }
              }}
            >
              <option value="difficulty">Difficulty (hardest)</option>
              <option value="lowest-probability">Lowest probability (history)</option>
              <option value="zpd-prereq-aware">ZPD (prereqs mastered, high success)</option>
              <option value="start-indicator">Start indicator (roots)</option>
              <option value="custom">Custom (manual)</option>
            </select>

            <label htmlFor="target-select">Target Learning Indicator</label>
            <select
              id="target-select"
              className="select"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              {graph.indicators.map((indicator) => (
                <option key={indicator.id} value={indicator.id}>
                  {indicator.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="section">
          <h3>Recommendation</h3>
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "0.75rem",
              background: "#f8fafc",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>
                {getIndicatorLabel(graph, recommendation.candidateId)}
              </strong>
              <span
                className={
                  recommendation.status === "recommended"
                    ? "badge badge-blue"
                    : recommendation.status === "auto-mastered"
                    ? "badge badge-green"
                    : recommendation.status === "needs-remediation"
                    ? "badge badge-amber"
                    : "badge badge-slate"
                }
              >
                {formatStatusLabel(recommendation.status)}
              </span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "#475569" }}>
              Probability:{" "}
              {formatProbability(recommendation.probability)}% /
              traversed path:{" "}
              {recommendation.traversed.length > 0
                ? recommendation.traversed.join(" → ")
                : "—"}
            </div>
            {recommendation.notes && (
              <div
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.85rem",
                  color: "#475569",
                }}
              >
                {recommendation.notes}
              </div>
            )}
          </div>
        </div>

        <div className="section">
          <h3>Log Outcome</h3>
          <div className="input-group">
            <p style={{ fontSize: "0.82rem", color: "#475569" }}>
              Choose an indicator override directly from the Dependency Graph panel. The
              selection there powers the manual override shown below.
            </p>
            {manualOutcomeIndicatorId ? (
              <p style={{ fontSize: "0.8rem", color: "#0f172a" }}>
                Active override: <strong>{getIndicatorLabel(graph, manualOutcomeIndicatorId)}</strong> ({manualOutcomeIndicatorId})
              </p>
            ) : (
              <p style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                No manual override selected. The recommendation engine choice will be used.
              </p>
            )}
          </div>
          <div className="input-group">
            <label>Outcome for candidate</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className={`btn${selectedOutcome === "correct" ? "" : "-ghost"}`}
                onClick={() => setSelectedOutcome("correct")}
              >
                Correct
              </button>
              <button
                type="button"
                className={`btn${selectedOutcome === "incorrect" ? "" : "-ghost"}`}
                onClick={() => setSelectedOutcome("incorrect")}
              >
                Incorrect
              </button>
            </div>
          </div>
          <button
            className="btn"
            style={{ marginTop: "0.75rem", width: "100%" }}
            onClick={handleRecordOutcome}
            disabled={!canRecord}
          >
            Record Outcome
          </button>
          {!canRecord && (
            <p
              style={{
                marginTop: "0.5rem",
                fontSize: "0.82rem",
                color: "#94a3b8",
              }}
            >
              Outcome logging is currently disabled because there is no candidate
              indicator available and no manual override selected. Try choosing
              an indicator from the dropdown or upload data to get
              recommendations.
            </p>
          )}
          <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#475569" }}>
            Logging outcome for: <strong>{activeLoggingIndicatorLabel}</strong>
          </p>
          <button
            className="btn-ghost"
            style={{ marginTop: "0.75rem", width: "100%" }}
            onClick={handleReset}
          >
            Reset abilities
          </button>
        </div>

        {abilityPanel}

        <div className="section">
          <h3>Recent Outcomes</h3>
          {history.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
              No outcomes yet. Record an attempt to see the learning curve.
            </p>
          ) : (
            <ul className="history-list">
              {history.map((entry) => (
                <li key={entry.timestamp} className="history-card">
                  <strong>
                    {entry.label} ({entry.indicatorId})
                  </strong>
                  <div className="history-meta">
                    {new Date(entry.timestamp).toLocaleTimeString()} • Outcome:{" "}
                    {entry.correct ? "Correct" : "Incorrect"}
                  </div>
                  <div className="history-meta">
                    p̂ before: {formatProbability(entry.probabilityBefore)}% → after:{" "}
                    {formatProbability(entry.probabilityAfter)}%
                  </div>
                  <div className="history-meta">
                    θ indicator: {formatAbility(entry.thetaBefore.indicator)} →{" "}
                    {formatAbility(entry.thetaAfter.indicator)} (
                    {formatPercentChange(
                      entry.thetaBefore.indicator,
                      entry.thetaAfter.indicator
                    )}
                    )
                  </div>
                  <div className="history-meta">
                    θ outcome: {formatAbility(entry.thetaBefore.outcome)} →{" "}
                    {formatAbility(entry.thetaAfter.outcome)} (
                    {formatPercentChange(
                      entry.thetaBefore.outcome,
                      entry.thetaAfter.outcome
                    )}
                    )
                  </div>
                  <div className="history-meta">
                    θ competency: {formatAbility(entry.thetaBefore.competency)} →{" "}
                    {formatAbility(entry.thetaAfter.competency)} (
                    {formatPercentChange(
                      entry.thetaBefore.competency,
                      entry.thetaAfter.competency
                    )}
                    )
                  </div>
                  <div className="history-meta">
                    θ subject: {formatAbility(entry.thetaBefore.subject)} →{" "}
                    {formatAbility(entry.thetaAfter.subject)} (
                    {formatPercentChange(
                      entry.thetaBefore.subject,
                      entry.thetaAfter.subject
                    )}
                    )
                  </div>
                  <div className="history-meta">
                    θ domain: {formatAbility(entry.thetaBefore.domain)} →{" "}
                    {formatAbility(entry.thetaAfter.domain)} (
                    {formatPercentChange(
                      entry.thetaBefore.domain,
                      entry.thetaAfter.domain
                    )}
                    )
                  </div>
                  <div className="history-meta">
                    θ grade: {formatAbility(entry.thetaBefore.grade)} →{" "}
                    {formatAbility(entry.thetaAfter.grade)} (
                    {formatPercentChange(
                      entry.thetaBefore.grade,
                      entry.thetaAfter.grade
                    )}
                    )
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="panel scroller">
        <h2>Dependency Graph</h2>
        <p style={{ marginTop: 0, fontSize: "0.9rem", color: "#475569" }}>
          Directed edges point towards more advanced learning indicators. Colors
          reflect predicted performance bands given the current ability state.
        </p>
        <GraphDiagram
          graph={graph}
          snapshot={snapshot}
          recommendation={recommendation}
          targetId={targetId}
          abilities={abilities}
          blendWeights={constantsSnapshot.blendWeights}
          gradeFilterId={graphGradeFilterId}
          subjectFilterId={graphSubjectFilterId}
          domainFilterId={graphDomainFilterId}
          competencyFilterId={graphCompetencyFilterId}
          onGradeFilterChange={setGraphGradeFilterId}
          onSubjectFilterChange={setGraphSubjectFilterId}
          onDomainFilterChange={setGraphDomainFilterId}
          onCompetencyFilterChange={setGraphCompetencyFilterId}
          overrideIndicatorId={manualOutcomeIndicatorId}
          onOverrideIndicatorChange={setManualOutcomeIndicatorId}
        />
      </div>
    </div>
  );
};

export default App;
