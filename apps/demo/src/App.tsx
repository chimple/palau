import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
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
} from "@pal/core";
import GraphDiagram from "./components/GraphDiagram";
import {
  cloneAbilities,
  getDefaultDataset,
  loadDatasetFromCsv,
  selectDefaultTargetIndicator,
} from "./data/loaders";

interface HistoryEntry {
  indicatorId: string;
  label: string;
  correct: boolean;
  probabilityBefore: number;
  probabilityAfter: number;
  timestamp: number;
}

const getIndicatorLabel = (graph: DependencyGraph, id: string) =>
  graph.indicators.find((li) => li.id === id)?.label ?? id;

const formatAbility = (value: number | undefined) =>
  (value ?? 0).toFixed(2);

const formatProbability = (value: number | undefined) =>
  ((value ?? 0) * 100).toFixed(1);

const formatStatusLabel = (
  status: RecommendationContext["status"]
): string =>
  status
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const formatConstant = (value: number): string => value.toFixed(2);

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
  >("difficulty");

  const computeTargetForPolicy = (
    graph: DependencyGraph,
    abilities: AbilityState,
    policy:
      | "difficulty"
      | "lowest-probability"
      | "start-indicator"
      | "custom"
      | "zpd-prereq-aware"
  ): string => {
    if (!graph || graph.indicators.length === 0) return "";
  const zpdRange = DEFAULT_ZPD_RANGE;
  const masteredThreshold = DEFAULT_MASTERED_THRESHOLD;

  switch (policy) {
      case "difficulty":
        return selectDefaultTargetIndicator(graph);
      case "start-indicator":
        return graph.startIndicatorId || selectDefaultTargetIndicator(graph);
      case "lowest-probability": {
        let bestId = graph.indicators[0].id;
        let bestProb = Infinity;
        for (const ind of graph.indicators) {
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

        // Policy thresholds (uses defaults from core unless overridden)

        // Eligible indicators: all prerequisites mastered.
        const eligibleAll = graph.indicators.filter((ind) =>
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
          for (const ind of graph.indicators) {
            for (const pre of ind.prerequisites) {
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
        for (const ind of graph.indicators) {
          for (const pre of ind.prerequisites) {
            if (!mastered.get(pre)) unmet.add(pre);
          }
        }

        if (unmet.size > 0) {
          const unmetArr = Array.from(unmet);
          // Build dependents map (prereq -> dependents) for BFS distance calculations
          const dependents = new Map<string, string[]>();
          for (const ind of graph.indicators) {
            for (const pre of ind.prerequisites) {
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
        return selectDefaultTargetIndicator(graph);
      }
      case "custom":
      default:
        // Custom leaves existing selection (handled by UI).
        return selectDefaultTargetIndicator(graph);
    }
  };

  const [targetId, setTargetId] = useState<string>(() =>
    computeTargetForPolicy(defaultDataset.graph, baselineAbilitiesRef.current, "difficulty")
  );

  useEffect(() => {
    // When graph or abilities change and the policy is not custom, recompute the
    // target to reflect the chosen policy (e.g., lowest-probability should
    // follow ability updates automatically).
    if (selectionPolicy !== "custom") {
      const newTarget = computeTargetForPolicy(graph, abilities, selectionPolicy);
      setTargetId(newTarget);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionPolicy, graph, abilities]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedOutcome, setSelectedOutcome] = useState<"correct" | "incorrect">(
    "correct"
  );
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

  const recommendation: RecommendationContext = useMemo(
    () =>
      recommendNextIndicator({
        graph,
        abilities,
        targetIndicatorId: targetId,
      }),
    [abilities, graph, targetId, constantsSnapshot]
  );

  const snapshot: GraphSnapshot = useMemo(
    () => buildGraphSnapshot(graph, abilities),
    [abilities, graph, constantsSnapshot]
  );

  const targetIndicator = useMemo(
    () => graph.indicators.find((li) => li.id === targetId),
    [graph, targetId]
  );

  const candidateIndicator = useMemo(
    () =>
      graph.indicators.find((li) => li.id === recommendation.candidateId),
    [graph, recommendation.candidateId]
  );

  // Allow recording outcomes whenever there is a candidate ID available.
  // Previously recording was restricted to `recommended` or `needs-remediation`.
  // Keeping recording available is useful for logging teacher-led attempts,
  // manual checks, or exploratory testing of the engine.
  const canRecord = Boolean(recommendation.candidateId);

  const resetAbilitiesToBaseline = () => {
    const clone = cloneAbilities(baselineAbilitiesRef.current);
    setAbilities(clone);
  };

  const handleRecordOutcome = () => {
    // If there is no candidate id we cannot record an outcome.
    if (!recommendation.candidateId) {
      return;
    }
    const timestamp = Date.now();
    const correct = selectedOutcome === "correct";
    setAbilities((prev) => {
      const result = updateAbilities({
        graph,
        abilities: prev,
        event: {
          indicatorId: recommendation.candidateId,
          correct,
          timestamp,
        },
      });
      const label = candidateIndicator?.label ?? recommendation.candidateId;
      setHistory((prevHistory) => [
        {
          indicatorId: recommendation.candidateId,
          label,
          correct,
          probabilityBefore: result.probabilityBefore,
          probabilityAfter: result.probabilityAfter,
          timestamp,
        },
        ...prevHistory,
      ]);
      return result.abilities;
    });
  };

  const handleReset = () => {
    resetAbilitiesToBaseline();
    setHistory([]);
    setSelectedOutcome("correct");
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
    const newTarget = computeTargetForPolicy(
      dataset.graph,
      baselineAbilitiesRef.current,
      selectionPolicy
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

  const abilityPanel = (() => {
    if (!targetIndicator) {
      return null;
    }
    const learningOutcome = graph.learningOutcomes.find(
      (lo) => lo.id === targetIndicator.learningOutcomeId
    );
    const competency = graph.competencies.find(
      (comp) => comp.id === targetIndicator.competencyId
    );
    const grade = graph.grades.find((item) => item.id === targetIndicator.gradeId);
    return (
      <div className="section">
        <h3>Ability Snapshot</h3>
        <div style={{ display: "grid", gap: "0.4rem", fontSize: "0.9rem" }}>
          <div>
            <strong>Target Indicator</strong>
            <div>
              {targetIndicator.label} ({targetIndicator.id}) — θ=
              {formatAbility(abilities.indicator[targetIndicator.id])}
            </div>
          </div>
          <div>
            <strong>Learning Outcome</strong>
            <div>
              {learningOutcome?.label ?? targetIndicator.learningOutcomeId} — θ=
              {formatAbility(
                abilities.outcome[targetIndicator.learningOutcomeId]
              )}
            </div>
          </div>
          <div>
            <strong>Competency</strong>
            <div>
              {competency?.label ?? targetIndicator.competencyId} — θ=
              {formatAbility(
                abilities.competency[targetIndicator.competencyId]
              )}
            </div>
          </div>
          <div>
            <strong>Grade Prior</strong>
            <div>
              {grade?.label ?? targetIndicator.gradeId} — θ=
              {formatAbility(abilities.grade[targetIndicator.gradeId])}
            </div>
          </div>
        </div>
      </div>
    );
  })();

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
              Graph CSV format: gradeId, gradeLabel, competencyId, competencyName,
              learningOutcomeId, learningOutcomeName, indicatorId, indicatorName,
              difficulty. Prerequisites CSV format: sourceIndicatorId,
              targetIndicatorId. Abilities CSV format: type, id, ability.
            </p>
            {dataError && (
              <p style={{ fontSize: "0.82rem", color: "#b91c1c" }}>{dataError}</p>
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
                grade {formatConstant(constantsSnapshot.blendWeights.grade)}
              </div>
              <div>
                Learning rates — indicator {formatConstant(constantsSnapshot.learningRates.indicator)},
                outcome {formatConstant(constantsSnapshot.learningRates.outcome)},
                competency {formatConstant(constantsSnapshot.learningRates.competency)},
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
                  const newTarget = computeTargetForPolicy(graph, abilities, policy);
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
              indicator available. Try selecting a different target indicator or
              upload graph/ability CSVs to generate recommendations.
            </p>
          )}
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
        />
      </div>
    </div>
  );
};

export default App;
