import { useMemo, useState } from "react";
import {
  IndicatorProgress,
  IRTAlgorithm,
  EloAlgorithm,
  SimpleMasteryAlgorithm,
  BayesianKnowledgeTracingAlgorithm,
  type AdaptiveAlgorithmId,
  toOutcomeSeries,
  useLearningPath
} from "@chimple/palau-core";
import { OutcomeChart } from "./components/OutcomeChart";
import { RecommendationList } from "./components/RecommendationList";
import { IndicatorDependencyGraph } from "./components/IndicatorDependencyGraph";
import { sampleGrades, sampleLearnerProfile } from "./mock/sampleData";

const grades = sampleGrades;
const learnerProfile = sampleLearnerProfile;

type ViewMode = "insights" | "graph";

const App = () => {
  const [algorithmId, setAlgorithmId] = useState<AdaptiveAlgorithmId>("simple");
  const [view, setView] = useState<ViewMode>("insights");

  const algorithm = useMemo(() => {
    switch (algorithmId) {
      case "irt":
        return new IRTAlgorithm();
      case "elo":
        return new EloAlgorithm();
      case "bkt":
        return new BayesianKnowledgeTracingAlgorithm();
      case "simple":
      default:
        return new SimpleMasteryAlgorithm();
    }
  }, [algorithmId]);

  const { recommendations } = useLearningPath({
    grades,
    learnerProfile,
    options: {
      limit: 6,
      allowBlocked: true
    },
    algorithm
  });

  const series = useMemo(() => toOutcomeSeries(recommendations), [recommendations]);

  return (
    <div className="app-shell">
      <header>
        <h1>Palau Adaptive Learning Demo</h1>
        <p>
          This interactive demo showcases personalised recommendations driven by
          the Palau core engine. Explore the suggested learning indicators and
          how they map to learning outcomes.
        </p>
        <div className="control-row">
          <label htmlFor="algorithm">
            Algorithm
            <select
              id="algorithm"
              value={algorithmId}
              onChange={event => setAlgorithmId(event.target.value as AdaptiveAlgorithmId)}
            >
              <option value="simple">Simple Mastery Weighted</option>
              <option value="irt">Item Response Theory</option>
              <option value="elo">Elo Skill Rating</option>
              <option value="bkt">Bayesian Knowledge Tracing</option>
            </select>
          </label>
        </div>
      </header>
      <nav className="tabs">
        <button
          type="button"
          className={view === "insights" ? "active" : ""}
          onClick={() => setView("insights")}
        >
          Insights
        </button>
        <button
          type="button"
          className={view === "graph" ? "active" : ""}
          onClick={() => setView("graph")}
        >
          Dependency Graph
        </button>
      </nav>
      {view === "insights" ? (
        <main className="grid">
          <section>
            <h2>Recommended Indicators</h2>
            <RecommendationList
              recommendations={recommendations}
              renderItem={rec => (
                <IndicatorProgress key={rec.indicator.id} recommendation={rec} />
              )}
            />
          </section>
          <section>
            <h2>Learning Outcome Progress</h2>
            <OutcomeChart series={series} />
          </section>
        </main>
      ) : (
        <section className="panel">
          <h2>Learning Indicator Dependency Graph</h2>
          <p className="panel-hint">
            Nodes represent learning indicators, arrows point to the indicators they unlock.
            Use the controls to explore the prerequisite flow.
          </p>
          <IndicatorDependencyGraph grades={grades} />
        </section>
      )}
    </div>
  );
};

export default App;
