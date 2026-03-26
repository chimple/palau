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
  parseCsv,
  recommendNextSkill,
  trimEmptyRows,
  updateAbilities,
  getSkillProbability,
  DEFAULT_ZPD_RANGE,
  DEFAULT_MASTERED_THRESHOLD,
  type AbilityState,
  type DependencyGraph,
  type GraphSnapshot,
  type RecommendationContext,
  type Skill,
} from "@chimple/palau-recommendation";
import GraphDiagram from "./components/GraphDiagram";
import {
  cloneAbilities,
  getDefaultDataset,
  loadDatasetFromCsv,
} from "./data/loaders";
import sampleAssessmentBatchCsv from "./data/sample-assessment-batch.csv?raw";
import sampleAbilitySnapshotCsv from "./data/sample-ability-snapshot.csv?raw";

interface AbilityVector {
  skill: number;
  outcome: number;
  competency: number;
  subject: number;
  domain: number;
}

interface HistoryEntry {
  skillId: string;
  label: string;
  correct: boolean;
  probabilityBefore: number;
  probabilityAfter: number;
  timestamp: number;
  thetaBefore: AbilityVector;
  thetaAfter: AbilityVector;
}

interface AssessmentEventReplay {
  order: number;
  sourceRow: number;
  skillId: string;
  label: string;
  correct: boolean;
  probabilityBefore: number;
  probabilityAfter: number;
  thetaBefore: AbilityVector;
  thetaAfter: AbilityVector;
}

interface AssessmentStudentReplay {
  studentId: string;
  targetSkillId: string;
  recommendation: RecommendationContext;
  finalAbilities: AbilityState;
  parsedEvents: AssessmentEventReplay[];
}

interface AbilitySnapshotValue {
  type: "skill" | "outcome" | "competency" | "domain" | "subject";
  id: string;
  ability: number;
  sourceRow: number;
}

interface AbilitySnapshotReplay {
  studentId: string;
  targetSkillId: string;
  recommendation: RecommendationContext;
  finalAbilities: AbilityState;
  appliedValues: AbilitySnapshotValue[];
}

interface RecommendationTestRowResult {
  rowNumber: number;
  studentId: string;
  currentSkillId: string;
  currentSkillLabel: string;
  targetSkillId: string;
  recommendationSkillId: string;
  recommendationSkillLabel: string;
  recommendationStatus: RecommendationContext["status"];
  recommendationProbability: number;
  recommendationMatchesNext: boolean | null;
  nextSkillId: string;
  nextSkillLabel: string;
  traversedPath: string[];
  notes: string;
  finalAbilities: AbilityState;
}

const getSkillLabel = (graph: DependencyGraph, id: string) =>
  graph.skills.find((li) => li.id === id)?.label ?? id;

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

const getAssessmentOutputPreview = (csvText: string, maxLines: number = 6) =>
  csvText
    .split(/\r?\n/)
    .slice(0, maxLines)
    .join("\n");

const App = () => {
  const defaultDataset = useMemo(() => getDefaultDataset(), []);
  const [graph, setGraph] = useState<DependencyGraph>(defaultDataset.graph);
  const [abilities, setAbilities] = useState<AbilityState>(() =>
    cloneAbilities(defaultDataset.abilities)
  );
  const baselineAbilitiesRef = useRef<AbilityState>(
    cloneAbilities(defaultDataset.abilities)
  );
  // Selection policy controls how the demo picks a default target skill.
  // Options: difficulty, lowest-probability, start-skill, custom
  const [selectionPolicy, setSelectionPolicy] = useState<
    | "difficulty"
    | "lowest-probability"
    | "start-skill"
    | "custom"
    | "zpd-prereq-aware"
  >("zpd-prereq-aware");

  const computeTargetForPolicy = (
    graph: DependencyGraph,
    abilities: AbilityState,
    policy:
      | "difficulty"
      | "lowest-probability"
      | "start-skill"
      | "custom"
      | "zpd-prereq-aware",
    filters?: {
      subjectId?: string;
      domainId?: string;
      competencyId?: string;
    }
  ): string => {
    if (!graph || graph.skills.length === 0) return "";
    const matchesFilter = (skill: Skill) => {
      if (filters?.subjectId && skill.subjectId !== filters.subjectId) {
        return false;
      }
      if (filters?.domainId && skill.domainId !== filters.domainId) {
        return false;
      }
      if (
        filters?.competencyId &&
        skill.competencyId !== filters.competencyId
      ) {
        return false;
      }
      return true;
    };
    const filtered = graph.skills.filter(matchesFilter);
    const skillPool =
      filtered.length > 0 ? filtered : graph.skills.slice();
    if (skillPool.length === 0) {
      return "";
    }
    const selectByDifficulty = (pool: Skill[]): string => {
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
        return selectByDifficulty(skillPool);
      case "start-skill": {
        const start =
          skillPool.find((skill) => skill.prerequisites.length === 0) ??
          skillPool[0];
        return start?.id ?? "";
      }
      case "lowest-probability": {
        let bestId = skillPool[0].id;
        let bestProb = Infinity;
        for (const ind of skillPool) {
          const p = getSkillProbability(graph, abilities, ind.id) ?? 0;
          if (p < bestProb) {
            bestProb = p;
            bestId = ind.id;
          }
        }
        return bestId;
      }
      case "zpd-prereq-aware": {
        // Compute probabilities and mastered/zpd status for all skills.
        const probs = new Map<string, number>();
        const mastered = new Map<string, boolean>();
        const inZpd = new Map<string, boolean>();
        for (const ind of graph.skills) {
          const p = getSkillProbability(graph, abilities, ind.id) ?? 0;
          probs.set(ind.id, p);
          mastered.set(ind.id, p >= masteredThreshold);
          inZpd.set(ind.id, p >= zpdRange[0] && p <= zpdRange[1]);
        }
        const skillSet = new Set(skillPool.map((ind) => ind.id));
        // Policy thresholds (uses defaults from core unless overridden)
        // Eligible skills: all prerequisites mastered.
        const eligibleAll = skillPool.filter((ind) =>
          ind.prerequisites.every((pre) => mastered.get(pre) === true)
        );
        // Prefer eligible skills that are not yet mastered themselves;
        // only fall back to already-mastered eligible skills if there
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

          // If no ZPD candidates, pick the eligible skill that is
          // graph-closest to any mastered skill (fewest forward edges),
          // tie-breaking by higher probability.
          const dependents = new Map<string, string[]>();
          for (const ind of skillPool) {
            for (const pre of ind.prerequisites) {
              if (!skillSet.has(pre)) {
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

        // Fallback: if no eligible skills (some prerequisites not mastered),
        // suggest unmet prerequisite nodes in this order:
        //  1) unmet prerequisites that are inside ZPD, ordered by descending
        //     probability (closest to mastered threshold first)
        //  2) unmet prerequisites below ZPD, ordered by descending probability
        //     (nearest remediation with highest chance first)
        const unmet = new Set<string>();
        for (const ind of skillPool) {
          for (const pre of ind.prerequisites) {
            if (!skillSet.has(pre)) continue;
            if (!mastered.get(pre)) unmet.add(pre);
          }
        }

        if (unmet.size > 0) {
          const unmetArr = Array.from(unmet);
          // Build dependents map (prereq -> dependents) for BFS distance calculations
          const dependents = new Map<string, string[]>();
          for (const ind of skillPool) {
            for (const pre of ind.prerequisites) {
              if (!skillSet.has(pre)) continue;
              const list = dependents.get(pre) ?? [];
              list.push(ind.id);
              dependents.set(pre, list);
            }
          }

          const nonMasteredTargets = new Set<string>();
          for (const ind of graph.skills) {
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
        return selectByDifficulty(skillPool);
      }
      case "custom":
      default:
        // Custom leaves existing selection (handled by UI).
        return selectByDifficulty(skillPool);
    }
  };

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
    graphSubjectFilterId,
    graphDomainFilterId,
    graphCompetencyFilterId,
  ]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedOutcome, setSelectedOutcome] = useState<"correct" | "incorrect">(
    "correct"
  );
  const [manualOutcomeSkillId, setManualOutcomeSkillId] =
    useState<string>("");
  const [assessmentUploadCsv, setAssessmentUploadCsv] = useState<string | null>(
    null
  );
  const [assessmentUploadText, setAssessmentUploadText] = useState<string>("");
  const [assessmentUploadError, setAssessmentUploadError] = useState<string | null>(
    null
  );
  const [assessmentUploadMessage, setAssessmentUploadMessage] = useState<
    string | null
  >(null);
  const [assessmentOutputCsv, setAssessmentOutputCsv] = useState<string | null>(
    null
  );
  const [assessmentStudentReplays, setAssessmentStudentReplays] = useState<
    AssessmentStudentReplay[]
  >([]);
  const [abilitySnapshotUploadCsv, setAbilitySnapshotUploadCsv] = useState<
    string | null
  >(null);
  const [abilitySnapshotText, setAbilitySnapshotText] = useState<string>("");
  const [abilitySnapshotError, setAbilitySnapshotError] = useState<
    string | null
  >(null);
  const [abilitySnapshotMessage, setAbilitySnapshotMessage] = useState<
    string | null
  >(null);
  const [abilitySnapshotReplays, setAbilitySnapshotReplays] = useState<
    AbilitySnapshotReplay[]
  >([]);
  const [recommendationTestUploadCsv, setRecommendationTestUploadCsv] =
    useState<string | null>(null);
  const [recommendationTestText, setRecommendationTestText] =
    useState<string>("");
  const [recommendationTestError, setRecommendationTestError] = useState<
    string | null
  >(null);
  const [recommendationTestMessage, setRecommendationTestMessage] = useState<
    string | null
  >(null);
  const [recommendationTestOutputCsv, setRecommendationTestOutputCsv] =
    useState<string | null>(null);
  const [recommendationTestResults, setRecommendationTestResults] = useState<
    RecommendationTestRowResult[]
  >([]);
  const [activeAssessmentStudentId, setActiveAssessmentStudentId] = useState<
    string | null
  >(null);
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
      !graphSubjectFilterId &&
      !graphDomainFilterId &&
      !graphCompetencyFilterId
    ) {
      return graph;
    }
    const filteredSkills = graph.skills.filter((skill) => {
      if (graphSubjectFilterId && skill.subjectId !== graphSubjectFilterId) {
        return false;
      }
      if (graphDomainFilterId && skill.domainId !== graphDomainFilterId) {
        return false;
      }
      if (
        graphCompetencyFilterId &&
        skill.competencyId !== graphCompetencyFilterId
      ) {
        return false;
      }
      return true;
    });
    if (filteredSkills.length === 0) {
      return graph;
    }
    const allowedIds = new Set(filteredSkills.map((skill) => skill.id));
    const trimmedSkills = filteredSkills.map((skill) => ({
      ...skill,
      prerequisites: skill.prerequisites.filter((pre) =>
        allowedIds.has(pre)
      ),
    }));
    const allowedSubjectIds = new Set(
      trimmedSkills.map((skill) => skill.subjectId)
    );
    const allowedDomainIds = new Set(
      trimmedSkills.map((skill) => skill.domainId)
    );
    const allowedCompetencyIds = new Set(
      trimmedSkills.map((skill) => skill.competencyId)
    );
    const allowedOutcomeIds = new Set(
      trimmedSkills.map((skill) => skill.outcomeId)
    );
    const filteredGraph: DependencyGraph = {
      startSkillId:
        trimmedSkills.find((skill) => skill.prerequisites.length === 0)?.id ??
        trimmedSkills[0].id,
      skills: trimmedSkills,
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
    graphSubjectFilterId,
    graphDomainFilterId,
    graphCompetencyFilterId,
  ]);

  const recommendation: RecommendationContext = useMemo(
    () =>
      recommendNextSkill({
        graph: recommendationGraph,
        abilities,
        subjectId:
          graphSubjectFilterId ||
          graph.skills.find((s) => s.id === targetId)?.subjectId ||
          graph.subjects[0]?.id ||
          "",
        targetSkillId: targetId,
      }),
    [abilities, recommendationGraph, targetId, constantsSnapshot]
  );

  const snapshot: GraphSnapshot = useMemo(
    () => buildGraphSnapshot(graph, abilities),
    [abilities, graph, constantsSnapshot]
  );

  const targetSkill = useMemo(
    () => graph.skills.find((li) => li.id === targetId),
    [graph, targetId]
  );

  const manualSkill = useMemo(
    () =>
      graph.skills.find((li) => li.id === manualOutcomeSkillId),
    [graph, manualOutcomeSkillId]
  );

  // Allow recording when we have a recommendation candidate or the user
  // explicitly picks a manual skill override.
  const canRecord = Boolean(recommendation.candidateId || manualSkill);

  const activeLoggingSkillId =
    manualSkill?.id ?? recommendation.candidateId ?? "";
  const activeLoggingSkillLabel = activeLoggingSkillId
    ? `${getSkillLabel(graph, activeLoggingSkillId)} (${activeLoggingSkillId})`
    : "None selected";

  const resetAbilitiesToBaseline = () => {
    const clone = cloneAbilities(baselineAbilitiesRef.current);
    setAbilities(clone);
    setActiveAssessmentStudentId(null);
  };

  const restoreBaselineGraphState = (
    policyOverride?:
      | "difficulty"
      | "lowest-probability"
      | "start-skill"
      | "custom"
      | "zpd-prereq-aware"
  ) => {
    const nextPolicy =
      policyOverride ??
      (selectionPolicy === "custom" ? "zpd-prereq-aware" : selectionPolicy);
    const clone = cloneAbilities(baselineAbilitiesRef.current);
    setAbilities(clone);
    setSelectionPolicy(nextPolicy);
    setTargetId(
      computeTargetForPolicy(graph, clone, nextPolicy, {
        subjectId: graphSubjectFilterId,
        domainId: graphDomainFilterId,
        competencyId: graphCompetencyFilterId,
      })
    );
    setManualOutcomeSkillId("");
    setHistory([]);
    setActiveAssessmentStudentId(null);
  };

  const applyAbilityStateToGraph = (args: {
    studentId: string;
    abilities: AbilityState;
    targetSkillId: string;
  }) => {
    const nextAbilities = cloneAbilities(args.abilities);
    const effectivePolicy =
      selectionPolicy === "custom" ? "zpd-prereq-aware" : selectionPolicy;
    setAbilities(nextAbilities);
    setSelectionPolicy(effectivePolicy);
    setTargetId(
      computeTargetForPolicy(graph, nextAbilities, effectivePolicy, {
        subjectId: graphSubjectFilterId,
        domainId: graphDomainFilterId,
        competencyId: graphCompetencyFilterId,
      })
    );
    setManualOutcomeSkillId("");
    setHistory([]);
    setActiveAssessmentStudentId(args.studentId);
  };

  const applyAssessmentReplayToGraph = (studentReplay: AssessmentStudentReplay) =>
    applyAbilityStateToGraph({
      studentId: studentReplay.studentId,
      abilities: studentReplay.finalAbilities,
      targetSkillId: studentReplay.targetSkillId,
    });

  const applyAbilitySnapshotReplayToGraph = (
    studentReplay: AbilitySnapshotReplay
  ) =>
    applyAbilityStateToGraph({
      studentId: studentReplay.studentId,
      abilities: studentReplay.finalAbilities,
      targetSkillId: studentReplay.targetSkillId,
    });

  const applyRecommendationTestResultToGraph = (
    result: RecommendationTestRowResult
  ) =>
    applyAbilityStateToGraph({
      studentId: `${result.studentId} / row ${result.rowNumber}`,
      abilities: result.finalAbilities,
      targetSkillId: result.targetSkillId,
    });

  const handleRecordOutcome = () => {
    const skillId =
      manualSkill?.id ?? recommendation.candidateId;
    if (!skillId) {
      return;
    }
    const timestamp = Date.now();
    const correct = selectedOutcome === "correct";
    const resolvedSkill =
      manualSkill ??
      graph.skills.find((li) => li.id === skillId);
    if (!resolvedSkill) {
      return;
    }
    const outcomeId = resolvedSkill.outcomeId;
    const competencyId = resolvedSkill.competencyId;
    const subjectId = resolvedSkill.subjectId;
    const domainId = resolvedSkill.domainId;
    const label = resolvedSkill.label ?? skillId;
    const result = updateAbilities({
      graph,
      abilities,
      events: [
        {
          skillId,
          correct,
          timestamp,
        },
      ],
    });
    const thetaBefore: AbilityVector = {
      skill: result.abilityBefore.skill,
      outcome: result.abilityBefore.outcome,
      competency: result.abilityBefore.competency,
      subject: result.abilityBefore.subject,
      domain: result.abilityBefore.domain,
    };
    const thetaAfter: AbilityVector = {
      skill: result.abilityAfter.skill,
      outcome: result.abilityAfter.outcome,
      competency: result.abilityAfter.competency,
      subject: result.abilityAfter.subject,
      domain: result.abilityAfter.domain,
    };
    setAbilities(result.abilities);
    setHistory((prevHistory) => [
      {
        skillId,
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

  const resolveSkillIdForAssessment = useCallback(
    (rawName: string) => {
      const normalize = (value: string) =>
        value
          .toLowerCase()
          .replace(/[\u2010-\u2015]/g, "-")
          .replace(/[\u2018\u2019\u201B]/g, "'")
          .replace(/[\u201C\u201D\u201F]/g, '"')
          .replace(/[^a-z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      const query = normalize(rawName);
      if (!query) {
        return "";
      }
      const exactId = graph.skills.find((skill) => normalize(skill.id) === query);
      if (exactId) {
        return exactId.id;
      }
      const exactLabel = graph.skills.find(
        (skill) => normalize(skill.label ?? "") === query
      );
      if (exactLabel) {
        return exactLabel.id;
      }
      const partial = graph.skills.find((skill) =>
        normalize(skill.label ?? "").includes(query)
      );
      return partial?.id ?? "";
    },
    [graph]
  );

  const resolveEntityId = useCallback(
    (
      type: AbilitySnapshotValue["type"],
      rawValue: string
    ) => {
      const normalize = (value: string) =>
        value
          .toLowerCase()
          .replace(/[\u2010-\u2015]/g, "-")
          .replace(/[\u2018\u2019\u201B]/g, "'")
          .replace(/[\u201C\u201D\u201F]/g, '"')
          .replace(/[^a-z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      const collections = {
        skill: graph.skills,
        outcome: graph.outcomes,
        competency: graph.competencies,
        domain: graph.domains,
        subject: graph.subjects,
      } as const;

      const query = normalize(rawValue);
      if (!query) {
        return "";
      }

      const items = collections[type];
      const exactId = items.find((item) => normalize(item.id) === query);
      if (exactId) {
        return exactId.id;
      }

      const exactLabel = items.find(
        (item) => normalize(item.label ?? "") === query
      );
      if (exactLabel) {
        return exactLabel.id;
      }

      const partial = items.find((item) =>
        normalize(`${item.id} ${item.label ?? ""}`).includes(query)
      );
      return partial?.id ?? "";
    },
    [graph]
  );

  const parseAssessmentRows = (text: string): string[][] => {
    return parseFlexibleRows(text);
  };

  const parseFlexibleRows = (text: string): string[][] => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      return [];
    }
    if (lines[0].includes("\t")) {
      return lines.map((line) => line.split("\t"));
    }
    return trimEmptyRows(parseCsv(text));
  };

  const parseActivityScores = (raw: string): number[] => {
    const cleaned = raw.replace(/[\[\]\(\)\s]/g, "");
    const matches = cleaned.match(/[01]/g);
    if (!matches) {
      return [];
    }
    return matches.map((item) => Number(item));
  };

  const handleApplyAssessmentUpload = () => {
    const source = assessmentUploadText.trim()
      ? assessmentUploadText
      : assessmentUploadCsv ?? "";
    if (!source.trim()) {
      setAssessmentUploadError(
        "Paste the assessment data with headers or upload a file first."
      );
      setAssessmentUploadMessage(null);
      setAssessmentOutputCsv(null);
      setAssessmentStudentReplays([]);
      setActiveAssessmentStudentId(null);
      return;
    }

    const rows = parseAssessmentRows(source);
    if (rows.length <= 1) {
      setAssessmentUploadError("Assessment input is empty or missing data rows.");
      setAssessmentUploadMessage(null);
      setAssessmentOutputCsv(null);
      setAssessmentStudentReplays([]);
      setActiveAssessmentStudentId(null);
      return;
    }

    const [header, ...dataRows] = rows;
    const normalizedHeader = header.map((cell) => cell.trim().toLowerCase());
    const findCol = (labels: string[]) =>
      normalizedHeader.findIndex((value) =>
        labels.some((label) => value === label || value.includes(label))
      );

    const studentIdx = findCol(["student_id", "student id", "studentid"]);
    const nameIdx = findCol(["name", "skill", "skill name", "skill_id", "skill id"]);
    const scoresIdx = findCol([
      "activities_scores",
      "activities score",
      "activity_scores",
      "activity score",
      "scores",
    ]);
    const orderIdx = findCol(["order", "sequence", "index", "idx"]);

    if (studentIdx < 0 || nameIdx < 0 || scoresIdx < 0) {
      setAssessmentUploadError(
        "Headers must include student_id, name, and activities_scores."
      );
      setAssessmentUploadMessage(null);
      setAssessmentOutputCsv(null);
      setAssessmentStudentReplays([]);
      setActiveAssessmentStudentId(null);
      return;
    }

    const eventsByStudent = new Map<
      string,
      Array<{ order: number; skillId: string; correct: boolean; row: number }>
    >();
    const warnings: string[] = [];
    let autoOrder = 0;

    for (let i = 0; i < dataRows.length; i += 1) {
      const row = dataRows[i];
      const studentId = (row[studentIdx] ?? "").trim();
      const rawName = (row[nameIdx] ?? "").trim();
      const rawScores = (row[scoresIdx] ?? "").trim();
      const baseOrderRaw = orderIdx >= 0 ? (row[orderIdx] ?? "").trim() : "";
      const baseOrder = Number.isFinite(Number(baseOrderRaw))
        ? Number(baseOrderRaw)
        : autoOrder++;

      if (!studentId) {
        warnings.push(`Row ${i + 2}: missing student_id.`);
        continue;
      }
      const skillId = resolveSkillIdForAssessment(rawName);
      if (!skillId) {
        warnings.push(`Row ${i + 2}: no skill match for "${rawName}".`);
        continue;
      }
      const scores = parseActivityScores(rawScores);
      if (scores.length === 0) {
        warnings.push(`Row ${i + 2}: activities_scores has no 0/1 values.`);
        continue;
      }
      const list = eventsByStudent.get(studentId) ?? [];
      scores.forEach((score, scoreIndex) => {
        list.push({
          order: baseOrder * 1000 + scoreIndex,
          skillId,
          correct: score === 1,
          row: i + 2,
        });
      });
      eventsByStudent.set(studentId, list);
    }

    if (eventsByStudent.size === 0) {
      setAssessmentUploadError(
        warnings.length > 0
          ? warnings.join(" ")
          : "No valid assessment rows found."
      );
      setAssessmentUploadMessage(null);
      setAssessmentOutputCsv(null);
      setAssessmentStudentReplays([]);
      setActiveAssessmentStudentId(null);
      return;
    }

    const escapeCsv = (value: string | number) => {
      const text = String(value ?? "");
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const outputRows: string[] = [];
    const studentReplays: AssessmentStudentReplay[] = [];
    outputRows.push(
      [
        "student_id",
        "target_skill_id",
        "events_logged",
        "recommendation_skill_id",
        "recommendation_skill_label",
        "recommendation_status",
        "recommendation_probability",
        "traversed_path",
        "notes",
      ].join(",")
    );

    for (const [studentId, events] of eventsByStudent.entries()) {
      const orderedEvents = events.slice().sort((a, b) => a.order - b.order);
      let studentAbilities = cloneAbilities(baselineAbilitiesRef.current);
      let loggedCount = 0;
      const parsedEvents: AssessmentEventReplay[] = [];

      for (const event of orderedEvents) {
        const updated = updateAbilities({
          graph,
          abilities: studentAbilities,
          events: [
            {
              skillId: event.skillId,
              correct: event.correct,
              timestamp: Date.now() + loggedCount,
            },
          ],
        });
        parsedEvents.push({
          order: event.order,
          sourceRow: event.row,
          skillId: event.skillId,
          label: getSkillLabel(graph, event.skillId),
          correct: event.correct,
          probabilityBefore: updated.probabilityBefore,
          probabilityAfter: updated.probabilityAfter,
          thetaBefore: updated.abilityBefore,
          thetaAfter: updated.abilityAfter,
        });
        studentAbilities = updated.abilities;
        loggedCount += 1;
      }

      const studentTargetId =
        selectionPolicy === "custom"
          ? targetId
          : computeTargetForPolicy(
              recommendationGraph,
              studentAbilities,
              selectionPolicy,
              {
                subjectId: graphSubjectFilterId,
                domainId: graphDomainFilterId,
                competencyId: graphCompetencyFilterId,
              }
            );
      const rec = recommendNextSkill({
        graph: recommendationGraph,
        abilities: studentAbilities,
        subjectId:
          graphSubjectFilterId ||
          graph.skills.find((s) => s.id === studentTargetId)?.subjectId ||
          graph.subjects[0]?.id ||
          "",
        targetSkillId: studentTargetId,
      });
      studentReplays.push({
        studentId,
        targetSkillId: studentTargetId,
        recommendation: rec,
        finalAbilities: cloneAbilities(studentAbilities),
        parsedEvents,
      });

      outputRows.push(
        [
          escapeCsv(studentId),
          escapeCsv(studentTargetId),
          escapeCsv(loggedCount),
          escapeCsv(rec.candidateId ?? ""),
          escapeCsv(rec.candidateId ? getSkillLabel(graph, rec.candidateId) : ""),
          escapeCsv(rec.status),
          escapeCsv((rec.probability ?? 0).toFixed(4)),
          escapeCsv((rec.traversed ?? []).join(" -> ")),
          escapeCsv(rec.notes ?? ""),
        ].join(",")
      );
    }

    setAssessmentOutputCsv(outputRows.join("\n"));
    setAssessmentStudentReplays(studentReplays);
    setActiveAssessmentStudentId(studentReplays[0]?.studentId ?? null);
    if (studentReplays[0]) {
      applyAssessmentReplayToGraph(studentReplays[0]);
    }
    setAssessmentUploadError(warnings.length > 0 ? warnings.join(" ") : null);
    setAssessmentUploadMessage(
      `Processed ${eventsByStudent.size} students and generated recommendations CSV.`
    );
  };

  const handleApplyAbilitySnapshot = () => {
    const source = abilitySnapshotText.trim()
      ? abilitySnapshotText
      : abilitySnapshotUploadCsv ?? "";
    if (!source.trim()) {
      setAbilitySnapshotError(
        "Paste the ability snapshot rows with headers or upload a file first."
      );
      setAbilitySnapshotMessage(null);
      setAbilitySnapshotReplays([]);
      return;
    }

    const rows = trimEmptyRows(parseCsv(source));
    if (rows.length <= 1) {
      setAbilitySnapshotError(
        "Ability snapshot input is empty or missing data rows."
      );
      setAbilitySnapshotMessage(null);
      setAbilitySnapshotReplays([]);
      return;
    }

    const [header, ...dataRows] = rows;
    const normalizedHeader = header.map((cell) => cell.trim().toLowerCase());
    const findCol = (labels: string[]) =>
      normalizedHeader.findIndex((value) =>
        labels.some((label) => value === label || value.includes(label))
      );

    const studentIdx = findCol(["student_id", "student id", "studentid"]);
    const targetIdx = findCol(["target_skill_id", "target skill id"]);
    const columnMap = {
      skill: {
        id: findCol([
          "indicator_id",
          "indicator id",
          "skill_id",
          "skill id",
        ]),
        ability: findCol([
          "indicator_ability",
          "indicator ability",
          "skill_ability",
          "skill ability",
        ]),
      },
      outcome: {
        id: findCol(["outcome_id", "outcome id"]),
        ability: findCol(["outcome_ability", "outcome ability"]),
      },
      competency: {
        id: findCol(["competency_id", "competency id"]),
        ability: findCol(["competency_ability", "competency ability"]),
      },
      domain: {
        id: findCol(["domain_id", "domain id"]),
        ability: findCol(["domain_ability", "domain ability"]),
      },
      subject: {
        id: findCol(["subject_id", "subject id"]),
        ability: findCol(["subject_ability", "subject ability"]),
      },
    } as const;

    if (studentIdx < 0) {
      setAbilitySnapshotError("Headers must include student_id.");
      setAbilitySnapshotMessage(null);
      setAbilitySnapshotReplays([]);
      return;
    }

    const studentSnapshots = new Map<
      string,
      {
        abilities: AbilityState;
        appliedValues: AbilitySnapshotValue[];
        targetSkillId?: string;
      }
    >();
    const warnings: string[] = [];

    for (let i = 0; i < dataRows.length; i += 1) {
      const row = dataRows[i];
      const studentId = (row[studentIdx] ?? "").trim();
      if (!studentId) {
        warnings.push(`Row ${i + 2}: missing student_id.`);
        continue;
      }

      const studentEntry =
        studentSnapshots.get(studentId) ?? {
          abilities: cloneAbilities(baselineAbilitiesRef.current),
          appliedValues: [],
          targetSkillId: "",
        };

      if (targetIdx >= 0) {
        const rawTarget = (row[targetIdx] ?? "").trim();
        if (rawTarget) {
          const resolvedTarget = resolveEntityId("skill", rawTarget);
          if (resolvedTarget) {
            studentEntry.targetSkillId = resolvedTarget;
          } else {
            warnings.push(
              `Row ${i + 2}: target_skill_id "${rawTarget}" not found in graph.`
            );
          }
        }
      }

      let appliedAny = false;
      (
        Object.entries(columnMap) as Array<
          [
            AbilitySnapshotValue["type"],
            { id: number; ability: number }
          ]
        >
      ).forEach(([type, indexes]) => {
        if (indexes.id < 0 || indexes.ability < 0) {
          return;
        }
        const id = (row[indexes.id] ?? "").trim();
        const abilityText = (row[indexes.ability] ?? "").trim();
        if (!id && !abilityText) {
          return;
        }
        if (!id || !abilityText) {
          warnings.push(
            `Row ${i + 2}: ${type} snapshot needs both id and ability.`
          );
          return;
        }
        const ability = Number.parseFloat(abilityText);
        if (!Number.isFinite(ability)) {
          warnings.push(
            `Row ${i + 2}: ${type}_ability "${abilityText}" is not numeric.`
          );
          return;
        }
        const resolvedId = resolveEntityId(type, id);
        if (!resolvedId) {
          warnings.push(`Row ${i + 2}: unknown ${type}_id "${id}".`);
          return;
        }
        studentEntry.abilities[type][resolvedId] = ability;
        studentEntry.appliedValues.push({
          type,
          id: resolvedId,
          ability,
          sourceRow: i + 2,
        });
        appliedAny = true;
      });

      if (!appliedAny) {
        warnings.push(
          `Row ${i + 2}: no valid skill/outcome/competency/domain/subject ability values found.`
        );
      }

      studentSnapshots.set(studentId, studentEntry);
    }

    if (studentSnapshots.size === 0) {
      setAbilitySnapshotError(
        warnings.length > 0
          ? warnings.join(" ")
          : "No valid ability snapshot rows found."
      );
      setAbilitySnapshotMessage(null);
      setAbilitySnapshotReplays([]);
      return;
    }

    const replays: AbilitySnapshotReplay[] = [];
    for (const [studentId, entry] of studentSnapshots.entries()) {
      if (entry.appliedValues.length === 0) {
        continue;
      }
      const targetSkillId =
        selectionPolicy === "custom" && entry.targetSkillId
          ? entry.targetSkillId
          : computeTargetForPolicy(
              recommendationGraph,
              entry.abilities,
              selectionPolicy,
              {
                subjectId: graphSubjectFilterId,
                domainId: graphDomainFilterId,
                competencyId: graphCompetencyFilterId,
              }
            );

      const recommendation = recommendNextSkill({
        graph: recommendationGraph,
        abilities: entry.abilities,
        subjectId:
          graphSubjectFilterId ||
          graph.skills.find((skill) => skill.id === targetSkillId)?.subjectId ||
          graph.subjects[0]?.id ||
          "",
        targetSkillId,
      });

      replays.push({
        studentId,
        targetSkillId,
        recommendation,
        finalAbilities: cloneAbilities(entry.abilities),
        appliedValues: entry.appliedValues.slice(),
      });
    }

    if (replays.length === 0) {
      setAbilitySnapshotError(
        warnings.length > 0
          ? warnings.join(" ")
          : "No valid ability snapshot rows found."
      );
      setAbilitySnapshotMessage(null);
      setAbilitySnapshotReplays([]);
      return;
    }

    setAbilitySnapshotReplays(replays);
    setAbilitySnapshotError(warnings.length > 0 ? warnings.join(" ") : null);
    setAbilitySnapshotMessage(
      `Processed ${replays.length} students from ability snapshot input.`
    );
    setActiveAssessmentStudentId(replays[0].studentId);
    applyAbilitySnapshotReplayToGraph(replays[0]);
  };

  const handleApplyRecommendationTest = () => {
    const source = recommendationTestText.trim()
      ? recommendationTestText
      : recommendationTestUploadCsv ?? "";
    if (!source.trim()) {
      setRecommendationTestError(
        "Paste the recommendation test rows with headers or upload a file first."
      );
      setRecommendationTestMessage(null);
      setRecommendationTestOutputCsv(null);
      setRecommendationTestResults([]);
      return;
    }

    const rows = parseFlexibleRows(source);
    if (rows.length <= 1) {
      setRecommendationTestError(
        "Recommendation test input is empty or missing data rows."
      );
      setRecommendationTestMessage(null);
      setRecommendationTestOutputCsv(null);
      setRecommendationTestResults([]);
      return;
    }

    const [header, ...dataRows] = rows;
    const normalizedHeader = header.map((cell) => cell.trim().toLowerCase());
    const findCol = (labels: string[]) =>
      normalizedHeader.findIndex((value) =>
        labels.some((label) => value === label || value.includes(label))
      );

    const scoresIdx = findCol([
      "activities_scores",
      "activities score",
      "activity_scores",
      "activity score",
      "scores",
    ]);
    const subjectIdIdx = findCol(["subject_id", "subject id"]);
    const subjectNameIdx = findCol(["subject_name", "subject name"]);
    const skillNameIdx = findCol(["skill_name", "skill name", "indicator_name"]);
    const domainNameIdx = findCol(["domain_name", "domain name"]);
    const competencyNameIdx = findCol(["competency_name", "competency name"]);
    const outcomeNameIdx = findCol(["outcome_name", "outcome name"]);
    const studentIdIdx = findCol(["student_id", "student id", "studentid"]);
    const createdAtIdx = findCol(["created_at", "created at", "timestamp"]);

    if (scoresIdx < 0 || skillNameIdx < 0 || studentIdIdx < 0) {
      setRecommendationTestError(
        "Headers must include activities_scores, skill_name, and student_id."
      );
      setRecommendationTestMessage(null);
      setRecommendationTestOutputCsv(null);
      setRecommendationTestResults([]);
      return;
    }

    const rowEntries: Array<{
      rowNumber: number;
      studentId: string;
      skillId: string;
      skillLabel: string;
      subjectId: string;
      domainId: string;
      competencyId: string;
      outcomeId: string;
      createdAt: number;
      scores: number[];
    }> = [];
    const warnings: string[] = [];

    for (let i = 0; i < dataRows.length; i += 1) {
      const row = dataRows[i];
      const rowNumber = i + 2;
      const studentId = (row[studentIdIdx] ?? "").trim();
      const rawSkill = (row[skillNameIdx] ?? "").trim();
      const rawScores = (row[scoresIdx] ?? "").trim();
      const rawSubjectId = subjectIdIdx >= 0 ? (row[subjectIdIdx] ?? "").trim() : "";
      const rawSubjectName =
        subjectNameIdx >= 0 ? (row[subjectNameIdx] ?? "").trim() : "";
      const rawDomain = domainNameIdx >= 0 ? (row[domainNameIdx] ?? "").trim() : "";
      const rawCompetency =
        competencyNameIdx >= 0 ? (row[competencyNameIdx] ?? "").trim() : "";
      const rawOutcome =
        outcomeNameIdx >= 0 ? (row[outcomeNameIdx] ?? "").trim() : "";
      const rawCreatedAt =
        createdAtIdx >= 0 ? (row[createdAtIdx] ?? "").trim() : "";

      if (!studentId) {
        warnings.push(`Row ${rowNumber}: missing student_id.`);
        continue;
      }

      const skillId = resolveEntityId("skill", rawSkill);
      if (!skillId) {
        warnings.push(`Row ${rowNumber}: no skill match for "${rawSkill}".`);
        continue;
      }

      const scores = parseActivityScores(rawScores);
      if (scores.length === 0) {
        warnings.push(`Row ${rowNumber}: activities_scores has no 0/1 values.`);
        continue;
      }

      const resolvedSubjectId =
        resolveEntityId("subject", rawSubjectId) ||
        resolveEntityId("subject", rawSubjectName) ||
        graph.skills.find((skill) => skill.id === skillId)?.subjectId ||
        "";
      const resolvedDomainId = resolveEntityId("domain", rawDomain);
      const resolvedCompetencyId = resolveEntityId("competency", rawCompetency);
      const resolvedOutcomeId = resolveEntityId("outcome", rawOutcome);

      const createdAt = rawCreatedAt ? Date.parse(rawCreatedAt) : Number.NaN;
      rowEntries.push({
        rowNumber,
        studentId,
        skillId,
        skillLabel: getSkillLabel(graph, skillId),
        subjectId: resolvedSubjectId,
        domainId: resolvedDomainId,
        competencyId: resolvedCompetencyId,
        outcomeId: resolvedOutcomeId,
        createdAt: Number.isFinite(createdAt) ? createdAt : rowNumber,
        scores,
      });
    }

    if (rowEntries.length === 0) {
      setRecommendationTestError(
        warnings.length > 0
          ? warnings.join(" ")
          : "No valid recommendation test rows found."
      );
      setRecommendationTestMessage(null);
      setRecommendationTestOutputCsv(null);
      setRecommendationTestResults([]);
      return;
    }

    const rowsByStudent = new Map<string, typeof rowEntries>();
    for (const entry of rowEntries) {
      const list = rowsByStudent.get(entry.studentId) ?? [];
      list.push(entry);
      rowsByStudent.set(entry.studentId, list);
    }

    const escapeCsv = (value: string | number | boolean | null) => {
      const text = String(value ?? "");
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const outputRows = [
      [
        "row_number",
        "student_id",
        "current_skill_id",
        "current_skill_label",
        "target_skill_id",
        "target_skill_label",
        "recommendation_skill_id",
        "recommendation_skill_label",
        "recommendation_status",
        "recommendation_probability",
        "recommendation_matches_next_input",
        "next_input_skill_id",
        "next_input_skill_label",
        "notes",
      ].join(","),
    ];
    const results: RecommendationTestRowResult[] = [];

    for (const [studentId, entries] of rowsByStudent.entries()) {
      const ordered = entries
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt || a.rowNumber - b.rowNumber);
      let studentAbilities = cloneAbilities(baselineAbilitiesRef.current);

      for (let i = 0; i < ordered.length; i += 1) {
        const entry = ordered[i];
        const updated = updateAbilities({
          graph,
          abilities: studentAbilities,
          events: entry.scores.map((score, scoreIndex) => ({
            skillId: entry.skillId,
            correct: score === 1,
            timestamp: entry.createdAt + scoreIndex,
          })),
        });
        studentAbilities = updated.abilities;

        const targetSkillId = computeTargetForPolicy(
          recommendationGraph,
          studentAbilities,
          "zpd-prereq-aware",
          {
            subjectId: entry.subjectId || undefined,
            domainId: entry.domainId || undefined,
            competencyId: entry.competencyId || undefined,
          }
        );
        const recommendation = recommendNextSkill({
          graph: recommendationGraph,
          abilities: studentAbilities,
          subjectId:
            entry.subjectId ||
            graph.skills.find((skill) => skill.id === targetSkillId)?.subjectId ||
            graph.subjects[0]?.id ||
            "",
          targetSkillId,
        });

        const nextEntry = ordered[i + 1];
        const matchesNext = nextEntry
          ? recommendation.candidateId === nextEntry.skillId
          : null;
        const result: RecommendationTestRowResult = {
          rowNumber: entry.rowNumber,
          studentId,
          currentSkillId: entry.skillId,
          currentSkillLabel: entry.skillLabel,
          targetSkillId,
          recommendationSkillId: recommendation.candidateId ?? "",
          recommendationSkillLabel: recommendation.candidateId
            ? getSkillLabel(graph, recommendation.candidateId)
            : "",
          recommendationStatus: recommendation.status,
          recommendationProbability: recommendation.probability ?? 0,
          recommendationMatchesNext: matchesNext,
          nextSkillId: nextEntry?.skillId ?? "",
          nextSkillLabel: nextEntry?.skillLabel ?? "",
          traversedPath: recommendation.traversed ?? [],
          notes: recommendation.notes ?? "",
          finalAbilities: cloneAbilities(studentAbilities),
        };
        results.push(result);
        outputRows.push(
          [
            escapeCsv(result.rowNumber),
            escapeCsv(result.studentId),
            escapeCsv(result.currentSkillId),
            escapeCsv(result.currentSkillLabel),
            escapeCsv(result.targetSkillId),
            escapeCsv(getSkillLabel(graph, result.targetSkillId)),
            escapeCsv(result.recommendationSkillId),
            escapeCsv(result.recommendationSkillLabel),
            escapeCsv(result.recommendationStatus),
            escapeCsv(result.recommendationProbability.toFixed(4)),
            escapeCsv(
              result.recommendationMatchesNext === null
                ? ""
                : result.recommendationMatchesNext
            ),
            escapeCsv(result.nextSkillId),
            escapeCsv(result.nextSkillLabel),
            escapeCsv(result.notes),
          ].join(",")
        );
      }
    }

    setRecommendationTestResults(results);
    setRecommendationTestOutputCsv(outputRows.join("\n"));
    setRecommendationTestError(warnings.length > 0 ? warnings.join(" ") : null);
    setRecommendationTestMessage(
      `Processed ${results.length} activity rows across ${rowsByStudent.size} students.`
    );
  };

  const handleDownloadRecommendationTestOutput = () => {
    if (!recommendationTestOutputCsv) {
      return;
    }
    const blob = new Blob([recommendationTestOutputCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "recommendation-testing-output.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAssessmentOutput = () => {
    if (!assessmentOutputCsv) {
      return;
    }
    const blob = new Blob([assessmentOutputCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "assessment-recommendations.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    restoreBaselineGraphState();
    setSelectedOutcome("correct");
  };

  const handleResetAbilitySnapshotModule = () => {
    setAbilitySnapshotUploadCsv(null);
    setAbilitySnapshotText("");
    setAbilitySnapshotError(null);
    setAbilitySnapshotMessage(null);
    setAbilitySnapshotReplays([]);
    restoreBaselineGraphState();
  };

  const handleResetRecommendationTestModule = () => {
    setRecommendationTestUploadCsv(null);
    setRecommendationTestText("");
    setRecommendationTestError(null);
    setRecommendationTestMessage(null);
    setRecommendationTestOutputCsv(null);
    setRecommendationTestResults([]);
    restoreBaselineGraphState();
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
    setManualOutcomeSkillId("");
    setGraphSubjectFilterId("");
    setGraphDomainFilterId("");
    setGraphCompetencyFilterId("");
    setAssessmentOutputCsv(null);
    setAssessmentStudentReplays([]);
    setAbilitySnapshotReplays([]);
    setRecommendationTestResults([]);
    setRecommendationTestOutputCsv(null);
    setActiveAssessmentStudentId(null);
    setAssessmentUploadError(null);
    setAssessmentUploadMessage(null);
    setAbilitySnapshotError(null);
    setAbilitySnapshotMessage(null);
    setRecommendationTestError(null);
    setRecommendationTestMessage(null);
    const newTarget = computeTargetForPolicy(
      dataset.graph,
      baselineAbilitiesRef.current,
      selectionPolicy,
      {
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
    setManualOutcomeSkillId("");
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
    skill: (typeof graph.skills)[number],
    abilityState: AbilityState
  ): number => {
    const weights = constantsSnapshot.blendWeights;
    const thetaSkill = abilityState.skill[skill.id] ?? 0;
    const thetaOutcome =
      abilityState.outcome[skill.outcomeId] ?? 0;
    const thetaCompetency =
      abilityState.competency[skill.competencyId] ?? 0;
    const thetaDomain = abilityState.domain[skill.domainId] ?? 0;
    return (
      thetaSkill * weights.skill +
      thetaOutcome * weights.outcome +
      thetaCompetency * weights.competency +
      thetaDomain * weights.domain
    );
  };

  const renderAbilitySnapshot = (
    skill: (typeof graph.skills)[number] | undefined,
    abilityState: AbilityState,
    heading: string,
    size: "default" | "compact" = "default"
  ) => {
    if (!skill) return null;
    const outcome = graph.outcomes.find(
      (lo) => lo.id === skill.outcomeId
    );
    const competency = graph.competencies.find(
      (comp) => comp.id === skill.competencyId
    );
    const subject = graph.subjects.find((item) => item.id === skill.subjectId);
    const domain = graph.domains.find((item) => item.id === skill.domainId);
    const fontSize = size === "compact" ? "0.85rem" : "0.9rem";
    const thetaBlend = computeThetaBlend(skill, abilityState);
    const probability = getSkillProbability(
      graph,
      abilityState,
      skill.id,
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
            <strong>Skill</strong>
            <div>
              {skill.label} ({skill.id}) — θ=
              {formatAbility(abilityState.skill[skill.id])}
            </div>
          </div>
          <div>
            <strong>Learning Outcome</strong>
            <div>
              {outcome?.label ?? skill.outcomeId} — θ=
              {formatAbility(abilityState.outcome[skill.outcomeId])}
            </div>
          </div>
          <div>
            <strong>Competency</strong>
            <div>
              {competency?.label ?? skill.competencyId} — θ=
              {formatAbility(abilityState.competency[skill.competencyId])}
            </div>
          </div>
          <div>
            <strong>Subject</strong>
            <div>
              {subject?.label ?? skill.subjectId} — θ=
              {formatAbility(abilityState.subject[skill.subjectId])}
            </div>
          </div>
          <div>
            <strong>Domain</strong>
            <div>
              {domain?.label ?? skill.domainId} — θ=
              {formatAbility(abilityState.domain[skill.domainId])}
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
  const abilityPanel = renderAbilitySnapshot(
    targetSkill,
    abilities,
    "Ability Snapshot"
  );

  return (
    <div className="app-shell">
      <div className="panel scroller">
        <h2>PAL Diagnostic Controller</h2>
        <p style={{ marginTop: 0, fontSize: "0.9rem", color: "#475569" }}>
          Tune outcomes to observe the adaptive recommendation engine update
          live. The recommendation surfaces the next Learning Skill in the
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
              Graph CSV format: subjectId, subjectName, domainId, domainName,
              competencyId, competencyName, outcomeId, outcomeName, skillId,
              skillName, difficulty.
              Prerequisites CSV format: sourceSkillId, targetSkillId.
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
            Upload or paste assessment data with headers
            {" "}
            <code>student_id,name,activities_scores,Order</code>
            . The app replays outcomes per student and generates final recommendations CSV.
          </p>
          <div className="input-group" style={{ gap: "0.6rem" }}>
            <label htmlFor="assessment-upload">Assessment file (CSV/TSV)</label>
            <input
              id="assessment-upload"
              className="select"
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              onChange={handleFileUpload(setAssessmentUploadCsv)}
            />
            <label htmlFor="assessment-paste">Or paste with headers</label>
            <textarea
              id="assessment-paste"
              className="input"
              rows={7}
              placeholder={"student_id\tname\tactivities_scores\tOrder"}
              value={assessmentUploadText}
              onChange={(event) => setAssessmentUploadText(event.target.value)}
            />
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn"
                type="button"
                onClick={handleApplyAssessmentUpload}
              >
                Run assessment batch
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => setAssessmentUploadText("")}
              >
                Clear pasted data
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  setAssessmentUploadText(sampleAssessmentBatchCsv);
                  setAssessmentUploadError(null);
                  setAssessmentUploadMessage(
                    "Loaded sample assessment batch into the paste box."
                  );
                }}
              >
                Load sample batch
              </button>
              {assessmentOutputCsv && (
                <button
                  className="btn"
                  type="button"
                  onClick={handleDownloadAssessmentOutput}
                >
                  Download recommendations CSV
                </button>
              )}
            </div>
            {assessmentUploadError && (
              <p style={{ fontSize: "0.8rem", color: "#b91c1c", margin: 0 }}>
                {assessmentUploadError}
              </p>
            )}
            {assessmentUploadMessage && (
              <p style={{ fontSize: "0.8rem", color: "#15803d", margin: 0 }}>
                {assessmentUploadMessage}
              </p>
            )}
            {assessmentOutputCsv && (
              <div>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "#475569",
                    margin: "0.25rem 0",
                  }}
                >
                  Output preview
                </p>
                <pre
                  style={{
                    margin: 0,
                    padding: "0.75rem",
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "0.5rem",
                    maxHeight: "12rem",
                    overflow: "auto",
                    fontSize: "0.75rem",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {getAssessmentOutputPreview(assessmentOutputCsv)}
                </pre>
              </div>
            )}
            {assessmentStudentReplays.length > 0 && (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "#475569",
                    margin: "0.25rem 0 0",
                  }}
                >
                  Student replay view
                </p>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "#475569",
                    margin: 0,
                  }}
                >
                  The live recommendation panel and dependency graph now reflect
                  the selected student replay. Current graph view:{" "}
                  <strong>{activeAssessmentStudentId ?? "baseline"}</strong>
                </p>
                {assessmentStudentReplays.map((studentReplay) => {
                  const targetSkill = graph.skills.find(
                    (skill) => skill.id === studentReplay.targetSkillId
                  );
                  const recommendedSkill = graph.skills.find(
                    (skill) =>
                      skill.id === studentReplay.recommendation.candidateId
                  );
                  return (
                    <details
                      key={studentReplay.studentId}
                      open
                      style={{
                        border: "1px solid #cbd5e1",
                        borderRadius: "0.75rem",
                        background:
                          activeAssessmentStudentId === studentReplay.studentId
                            ? "#eff6ff"
                            : "#f8fafc",
                        padding: "0.75rem",
                      }}
                    >
                      <summary
                        style={{
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "0.75rem",
                        }}
                      >
                        <strong>{studentReplay.studentId}</strong>
                        <span
                          className={
                            studentReplay.recommendation.status ===
                            "recommended"
                              ? "badge badge-blue"
                              : studentReplay.recommendation.status ===
                                "auto-mastered"
                              ? "badge badge-green"
                              : studentReplay.recommendation.status ===
                                "needs-remediation"
                              ? "badge badge-amber"
                              : "badge badge-slate"
                          }
                        >
                          {formatStatusLabel(
                            studentReplay.recommendation.status
                          )}
                        </span>
                      </summary>
                      <div
                        style={{
                          display: "grid",
                          gap: "0.75rem",
                          marginTop: "0.75rem",
                        }}
                      >
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className={
                              activeAssessmentStudentId ===
                              studentReplay.studentId
                                ? "btn"
                                : "btn-ghost"
                            }
                            onClick={() =>
                              applyAssessmentReplayToGraph(studentReplay)
                            }
                          >
                            {activeAssessmentStudentId ===
                            studentReplay.studentId
                              ? "Applied to graph"
                              : "Apply to graph"}
                          </button>
                        </div>
                        <div
                          style={{
                            fontSize: "0.82rem",
                            color: "#334155",
                            display: "grid",
                            gap: "0.25rem",
                          }}
                        >
                          <div>
                            <strong>Chosen target</strong>:{" "}
                            {targetSkill?.label ?? studentReplay.targetSkillId}
                          </div>
                          <div>
                            <strong>Final recommendation</strong>:{" "}
                            {recommendedSkill?.label ??
                              studentReplay.recommendation.candidateId}
                          </div>
                          <div>
                            <strong>Why selected</strong>:{" "}
                            {studentReplay.recommendation.notes ??
                              "No extra note from engine."}
                          </div>
                          <div>
                            <strong>Prerequisite path</strong>:{" "}
                            {studentReplay.recommendation.traversed.length > 0
                              ? studentReplay.recommendation.traversed.join(
                                  " -> "
                                )
                              : "—"}
                          </div>
                          <div>
                            <strong>Recommendation probability</strong>:{" "}
                            {formatProbability(
                              studentReplay.recommendation.probability
                            )}
                            %
                          </div>
                        </div>

                        <div>
                          <strong
                            style={{ fontSize: "0.82rem", color: "#334155" }}
                          >
                            Parsed events
                          </strong>
                          <div
                            style={{
                              display: "grid",
                              gap: "0.5rem",
                              marginTop: "0.5rem",
                            }}
                          >
                            {studentReplay.parsedEvents.map((event, index) => (
                              <div
                                key={`${studentReplay.studentId}-${event.order}-${index}`}
                                style={{
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "0.5rem",
                                  padding: "0.6rem",
                                  background: "#fff",
                                  fontSize: "0.8rem",
                                  color: "#334155",
                                }}
                              >
                                <div>
                                  <strong>Step {index + 1}</strong>: {event.label}
                                </div>
                                <div>
                                  Source row {event.sourceRow} / order {event.order}
                                </div>
                                <div>
                                  Outcome: {event.correct ? "Correct" : "Incorrect"}
                                </div>
                                <div>
                                  p before {formatProbability(event.probabilityBefore)}
                                  % {"->"} after{" "}
                                  {formatProbability(event.probabilityAfter)}%
                                </div>
                                <div>
                                  theta skill {formatAbility(event.thetaBefore.skill)}{" "}
                                  {"->"} {formatAbility(event.thetaAfter.skill)} | outcome{" "}
                                  {formatAbility(event.thetaBefore.outcome)} {"->"}{" "}
                                  {formatAbility(event.thetaAfter.outcome)}
                                </div>
                                <div>
                                  theta competency{" "}
                                  {formatAbility(event.thetaBefore.competency)} {"->"}{" "}
                                  {formatAbility(event.thetaAfter.competency)} |
                                  domain {formatAbility(event.thetaBefore.domain)}{" "}
                                  {"->"} {formatAbility(event.thetaAfter.domain)} |
                                  subject {formatAbility(event.thetaBefore.subject)}{" "}
                                  {"->"} {formatAbility(event.thetaAfter.subject)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {targetSkill &&
                          renderAbilitySnapshot(
                            targetSkill,
                            studentReplay.finalAbilities,
                            "Final Ability Snapshot For Target",
                            "compact"
                          )}
                        {recommendedSkill &&
                          recommendedSkill.id !== targetSkill?.id &&
                          renderAbilitySnapshot(
                            recommendedSkill,
                            studentReplay.finalAbilities,
                            "Final Ability Snapshot For Recommended Skill",
                            "compact"
                          )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="section">
          <h3>Recommendation Testing Module</h3>
          <p style={{ marginTop: 0, fontSize: "0.85rem", color: "#475569" }}>
            Upload or paste activity rows and evaluate the engine after each
            row. This module uses a system-generated target from the
            <code>zpd-prereq-aware</code> policy, then compares the resulting
            recommendation against the next uploaded skill for the same student.
            Use TSV or properly quoted CSV when text fields contain commas.
          </p>
          <div className="input-group" style={{ gap: "0.6rem" }}>
            <label htmlFor="recommendation-test-upload">
              Recommendation test file (CSV/TSV)
            </label>
            <input
              id="recommendation-test-upload"
              className="select"
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              onChange={handleFileUpload(setRecommendationTestUploadCsv)}
            />
            <label htmlFor="recommendation-test-paste">Or paste with headers</label>
            <textarea
              id="recommendation-test-paste"
              className="input"
              rows={8}
              placeholder={
                "activities_scores\tsubject_id\tcreated_at\tskill_name\tdomain_name\tcompetency_name\toutcome_name\tstudent_id\tsubject_name"
              }
              value={recommendationTestText}
              onChange={(event) => setRecommendationTestText(event.target.value)}
            />
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn"
                type="button"
                onClick={handleApplyRecommendationTest}
              >
                Run recommendation test
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => setRecommendationTestText("")}
              >
                Clear pasted data
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={handleResetRecommendationTestModule}
              >
                Reset module
              </button>
              {recommendationTestOutputCsv && (
                <button
                  className="btn"
                  type="button"
                  onClick={handleDownloadRecommendationTestOutput}
                >
                  Download test output CSV
                </button>
              )}
            </div>
            {recommendationTestError && (
              <p style={{ fontSize: "0.8rem", color: "#b91c1c", margin: 0 }}>
                {recommendationTestError}
              </p>
            )}
            {recommendationTestMessage && (
              <p style={{ fontSize: "0.8rem", color: "#15803d", margin: 0 }}>
                {recommendationTestMessage}
              </p>
            )}
            {recommendationTestOutputCsv && (
              <div>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "#475569",
                    margin: "0.25rem 0",
                  }}
                >
                  Output preview
                </p>
                <pre
                  style={{
                    margin: 0,
                    padding: "0.75rem",
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "0.5rem",
                    maxHeight: "12rem",
                    overflow: "auto",
                    fontSize: "0.75rem",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {getAssessmentOutputPreview(recommendationTestOutputCsv)}
                </pre>
              </div>
            )}
            {recommendationTestResults.length > 0 && (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "#475569",
                    margin: "0.25rem 0 0",
                  }}
                >
                  Row-wise test results ({recommendationTestResults.length})
                </p>
                <div
                  style={{
                    display: "grid",
                    gap: "0.5rem",
                    maxHeight: "28rem",
                    overflow: "auto",
                    paddingRight: "0.25rem",
                  }}
                >
                  {recommendationTestResults.map((result) => (
                    <div
                      key={`${result.studentId}-${result.rowNumber}`}
                      style={{
                        border: "1px solid #cbd5e1",
                        borderRadius: "0.75rem",
                        background:
                          activeAssessmentStudentId ===
                          `${result.studentId} / row ${result.rowNumber}`
                            ? "#eff6ff"
                            : "#f8fafc",
                        padding: "0.75rem",
                        fontSize: "0.82rem",
                        color: "#334155",
                        display: "grid",
                        gap: "0.25rem",
                      }}
                    >
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className={
                            activeAssessmentStudentId ===
                            `${result.studentId} / row ${result.rowNumber}`
                              ? "btn"
                              : "btn-ghost"
                          }
                          onClick={() =>
                            applyRecommendationTestResultToGraph(result)
                          }
                        >
                          {activeAssessmentStudentId ===
                          `${result.studentId} / row ${result.rowNumber}`
                            ? "Applied to graph"
                            : "Apply to graph"}
                        </button>
                      </div>
                      <div>
                        <strong>Row {result.rowNumber}</strong> / student{" "}
                        {result.studentId}
                      </div>
                      <div>
                        Current skill: {result.currentSkillLabel}
                      </div>
                      <div>
                        ZPD target skill: {getSkillLabel(graph, result.targetSkillId)}
                      </div>
                      <div>
                        Recommendation: {result.recommendationSkillLabel} (
                        {formatStatusLabel(result.recommendationStatus)} /{" "}
                        {formatProbability(result.recommendationProbability)}%)
                      </div>
                      <div>
                        Traversed path:{" "}
                        {result.traversedPath.length > 0
                          ? result.traversedPath.join(" -> ")
                          : "—"}
                      </div>
                      <div>
                        Next uploaded skill:{" "}
                        {result.nextSkillLabel || "—"}
                      </div>
                      <div>
                        Matches next uploaded skill:{" "}
                        {result.recommendationMatchesNext === null
                          ? "—"
                          : result.recommendationMatchesNext
                          ? "Yes"
                          : "No"}
                      </div>
                      <div>
                        Notes: {result.notes || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="section">
          <h3>Ability Snapshot Module</h3>
          <p style={{ marginTop: 0, fontSize: "0.85rem", color: "#475569" }}>
            Upload or paste learner ability snapshots and run the same
            recommendation engine without replaying events. Expected columns:
            <code>
              student_id, indicator_id, indicator_ability, outcome_id,
              outcome_ability, competency_id, competency_ability, domain_id,
              domain_ability, subject_id, subject_ability, target_skill_id
            </code>
            . `skill_id` / `skill_ability` are also accepted for backward
            compatibility. `target_skill_id` is only used when the selection
            policy is `Custom`; otherwise the active policy, including ZPD
            target selection, is applied from the snapshot abilities.
          </p>
          <div className="input-group" style={{ gap: "0.6rem" }}>
            <label htmlFor="ability-snapshot-upload">
              Snapshot file (CSV/TSV)
            </label>
            <input
              id="ability-snapshot-upload"
              className="select"
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              onChange={handleFileUpload(setAbilitySnapshotUploadCsv)}
            />
            <label htmlFor="ability-snapshot-paste">Or paste with headers</label>
            <textarea
              id="ability-snapshot-paste"
              className="input"
              rows={7}
              placeholder={
                "student_id,indicator_id,indicator_ability,outcome_id,outcome_ability,..."
              }
              value={abilitySnapshotText}
              onChange={(event) => setAbilitySnapshotText(event.target.value)}
            />
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn"
                type="button"
                onClick={handleApplyAbilitySnapshot}
              >
                Run ability snapshot
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => setAbilitySnapshotText("")}
              >
                Clear pasted data
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={handleResetAbilitySnapshotModule}
              >
                Reset module
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  setAbilitySnapshotText(sampleAbilitySnapshotCsv);
                  setAbilitySnapshotError(null);
                  setAbilitySnapshotMessage(
                    "Loaded sample ability snapshot into the paste box."
                  );
                }}
              >
                Load sample snapshot
              </button>
            </div>
            {abilitySnapshotError && (
              <p style={{ fontSize: "0.8rem", color: "#b91c1c", margin: 0 }}>
                {abilitySnapshotError}
              </p>
            )}
            {abilitySnapshotMessage && (
              <p style={{ fontSize: "0.8rem", color: "#15803d", margin: 0 }}>
                {abilitySnapshotMessage}
              </p>
            )}
            {abilitySnapshotReplays.length > 0 && (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "#475569",
                    margin: "0.25rem 0 0",
                  }}
                >
                  Snapshot recommendation view
                </p>
                {abilitySnapshotReplays.map((studentReplay) => {
                  const targetSkill = graph.skills.find(
                    (skill) => skill.id === studentReplay.targetSkillId
                  );
                  const recommendedSkill = graph.skills.find(
                    (skill) =>
                      skill.id === studentReplay.recommendation.candidateId
                  );
                  return (
                    <details
                      key={studentReplay.studentId}
                      style={{
                        border: "1px solid #cbd5e1",
                        borderRadius: "0.75rem",
                        background:
                          activeAssessmentStudentId === studentReplay.studentId
                            ? "#eff6ff"
                            : "#f8fafc",
                        padding: "0.75rem",
                      }}
                    >
                      <summary
                        style={{
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "0.75rem",
                        }}
                      >
                        <strong>{studentReplay.studentId}</strong>
                        <span
                          className={
                            studentReplay.recommendation.status ===
                            "recommended"
                              ? "badge badge-blue"
                              : studentReplay.recommendation.status ===
                                "auto-mastered"
                              ? "badge badge-green"
                              : studentReplay.recommendation.status ===
                                "needs-remediation"
                              ? "badge badge-amber"
                              : "badge badge-slate"
                          }
                        >
                          {formatStatusLabel(
                            studentReplay.recommendation.status
                          )}
                        </span>
                      </summary>
                      <div
                        style={{
                          display: "grid",
                          gap: "0.75rem",
                          marginTop: "0.75rem",
                        }}
                      >
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className={
                              activeAssessmentStudentId ===
                              studentReplay.studentId
                                ? "btn"
                                : "btn-ghost"
                            }
                            onClick={() =>
                              applyAbilitySnapshotReplayToGraph(studentReplay)
                            }
                          >
                            {activeAssessmentStudentId ===
                            studentReplay.studentId
                              ? "Applied to graph"
                              : "Apply to graph"}
                          </button>
                        </div>
                        <div
                          style={{
                            fontSize: "0.82rem",
                            color: "#334155",
                            display: "grid",
                            gap: "0.25rem",
                          }}
                        >
                          <div>
                            <strong>Chosen target</strong>:{" "}
                            {targetSkill?.label ?? studentReplay.targetSkillId}
                          </div>
                          <div>
                            <strong>Final recommendation</strong>:{" "}
                            {recommendedSkill?.label ??
                              studentReplay.recommendation.candidateId}
                          </div>
                          <div>
                            <strong>Why selected</strong>:{" "}
                            {studentReplay.recommendation.notes ??
                              "No extra note from engine."}
                          </div>
                          <div>
                            <strong>Prerequisite path</strong>:{" "}
                            {studentReplay.recommendation.traversed.length > 0
                              ? studentReplay.recommendation.traversed.join(
                                  " -> "
                                )
                              : "—"}
                          </div>
                          <div>
                            <strong>Recommendation probability</strong>:{" "}
                            {formatProbability(
                              studentReplay.recommendation.probability
                            )}
                            %
                          </div>
                        </div>
                        <div>
                          <strong
                            style={{ fontSize: "0.82rem", color: "#334155" }}
                          >
                            Applied snapshot values
                          </strong>
                          <div
                            style={{
                              display: "grid",
                              gap: "0.5rem",
                              marginTop: "0.5rem",
                            }}
                          >
                            {studentReplay.appliedValues.map((item, index) => (
                              <div
                                key={`${studentReplay.studentId}-${item.type}-${item.id}-${index}`}
                                style={{
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "0.5rem",
                                  padding: "0.6rem",
                                  background: "#fff",
                                  fontSize: "0.8rem",
                                  color: "#334155",
                                }}
                              >
                                <div>
                                  <strong>{item.type}</strong>: {item.id}
                                </div>
                                <div>
                                  Source row {item.sourceRow} / ability{" "}
                                  {formatAbility(item.ability)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        {targetSkill &&
                          renderAbilitySnapshot(
                            targetSkill,
                            studentReplay.finalAbilities,
                            "Snapshot Ability For Target",
                            "compact"
                          )}
                        {recommendedSkill &&
                          recommendedSkill.id !== targetSkill?.id &&
                          renderAbilitySnapshot(
                            recommendedSkill,
                            studentReplay.finalAbilities,
                            "Snapshot Ability For Recommended Skill",
                            "compact"
                          )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
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
                Blend weights — skill {formatConstant(constantsSnapshot.blendWeights.skill)},
                outcome {formatConstant(constantsSnapshot.blendWeights.outcome)},
                competency {formatConstant(constantsSnapshot.blendWeights.competency)},
                domain {formatConstant(constantsSnapshot.blendWeights.domain)},
                subject {formatConstant(constantsSnapshot.blendWeights.subject)}
              </div>
              <div>
                Learning rates — skill {formatConstant(constantsSnapshot.learningRates.skill)},
                outcome {formatConstant(constantsSnapshot.learningRates.outcome)},
                competency {formatConstant(constantsSnapshot.learningRates.competency)},
                domain {formatConstant(constantsSnapshot.learningRates.domain)},
                subject {formatConstant(constantsSnapshot.learningRates.subject)}
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
                  | "start-skill"
                  | "custom"
                  | "zpd-prereq-aware";
                setSelectionPolicy(policy);
                if (policy !== "custom") {
                  const newTarget = computeTargetForPolicy(
                    graph,
                    abilities,
                    policy,
                    {
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
              <option value="start-skill">Start skill (roots)</option>
              <option value="custom">Custom (manual)</option>
            </select>

            <label htmlFor="target-select">Target Learning Skill</label>
            <select
              id="target-select"
              className="select"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              {graph.skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.label}
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
                {getSkillLabel(graph, recommendation.candidateId)}
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
              Choose an skill override directly from the Dependency Graph panel. The
              selection there powers the manual override shown below.
            </p>
            {manualOutcomeSkillId ? (
              <p style={{ fontSize: "0.8rem", color: "#0f172a" }}>
                Active override: <strong>{getSkillLabel(graph, manualOutcomeSkillId)}</strong> ({manualOutcomeSkillId})
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
              skill available and no manual override selected. Try choosing
              an skill from the dropdown or upload data to get
              recommendations.
            </p>
          )}
          <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#475569" }}>
            Logging outcome for: <strong>{activeLoggingSkillLabel}</strong>
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
                    {entry.label} ({entry.skillId})
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
                    θ skill: {formatAbility(entry.thetaBefore.skill)} →{" "}
                    {formatAbility(entry.thetaAfter.skill)} (
                    {formatPercentChange(
                      entry.thetaBefore.skill,
                      entry.thetaAfter.skill
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="panel scroller">
        <h2>Dependency Graph</h2>
        <p style={{ marginTop: 0, fontSize: "0.9rem", color: "#475569" }}>
          Directed edges point towards more advanced learning skills. Colors
          reflect predicted performance bands given the current ability state.
        </p>
        <GraphDiagram
          graph={graph}
          snapshot={snapshot}
          recommendation={recommendation}
          targetId={targetId}
          abilities={abilities}
          blendWeights={constantsSnapshot.blendWeights}
          subjectFilterId={graphSubjectFilterId}
          domainFilterId={graphDomainFilterId}
          competencyFilterId={graphCompetencyFilterId}
          onSubjectFilterChange={setGraphSubjectFilterId}
          onDomainFilterChange={setGraphDomainFilterId}
          onCompetencyFilterChange={setGraphCompetencyFilterId}
          overrideSkillId={manualOutcomeSkillId}
          onOverrideSkillChange={setManualOutcomeSkillId}
        />
      </div>
    </div>
  );
};

export default App;
