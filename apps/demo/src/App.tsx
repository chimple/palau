import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  buildGraphSnapshot,
  recommendNextIndicator,
  updateAbilities,
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

const App = () => {
  const defaultDataset = useMemo(() => getDefaultDataset(), []);
  const [graph, setGraph] = useState<DependencyGraph>(defaultDataset.graph);
  const [abilities, setAbilities] = useState<AbilityState>(() =>
    cloneAbilities(defaultDataset.abilities)
  );
  const baselineAbilitiesRef = useRef<AbilityState>(
    cloneAbilities(defaultDataset.abilities)
  );
  const [targetId, setTargetId] = useState<string>(() =>
    selectDefaultTargetIndicator(defaultDataset.graph)
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedOutcome, setSelectedOutcome] = useState<"correct" | "incorrect">(
    "correct"
  );
  const [uploadedGraphCsv, setUploadedGraphCsv] = useState<string | null>(null);
  const [uploadedPrereqCsv, setUploadedPrereqCsv] = useState<string | null>(null);
  const [uploadedAbilityCsv, setUploadedAbilityCsv] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  const recommendation: RecommendationContext = useMemo(
    () =>
      recommendNextIndicator({
        graph,
        abilities,
        targetIndicatorId: targetId,
      }),
    [abilities, graph, targetId]
  );

  const snapshot: GraphSnapshot = useMemo(
    () => buildGraphSnapshot(graph, abilities),
    [abilities, graph]
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

  const canRecord =
    recommendation.status === "recommended" ||
    recommendation.status === "needs-remediation";

  const resetAbilitiesToBaseline = () => {
    const clone = cloneAbilities(baselineAbilitiesRef.current);
    setAbilities(clone);
  };

  const handleRecordOutcome = () => {
    if (!candidateIndicator || !recommendation.candidateId || !canRecord) {
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
      setHistory((prevHistory) => [
        {
          indicatorId: recommendation.candidateId,
          label: candidateIndicator.label,
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
    const newTarget = selectDefaultTargetIndicator(dataset.graph);
    setTargetId(newTarget);
  };

  const handleRestoreDefault = () => {
    applyDataset(getDefaultDataset());
    setUploadedGraphCsv(null);
    setUploadedPrereqCsv(null);
    setUploadedAbilityCsv(null);
    setDataError(null);
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

  const handleFileUpload =
    (setter: (content: string | null) => void) =>
    async (event: ChangeEvent<HTMLInputElement>) => {
      const { files } = event.target;
      if (!files || files.length === 0) {
        setter(null);
        return;
      }
      const file = files[0];
      const text = await file.text();
      setter(text);
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
          <div className="input-group">
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
              Outcome logging is enabled when a recommendation is available or
              remediation is requested.
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
