import { useCallback, useMemo, useState } from "react";
import {
  IndicatorProgress,
  IRTAlgorithm,
  EloAlgorithm,
  SimpleMasteryAlgorithm,
  BayesianKnowledgeTracingAlgorithm,
  ModifiedEloAlgorithm,
  buildIndicatorGraph,
  type AdaptiveAlgorithmId,
  type Grade,
  type LearnerAbilityMaps,
  type LearnerCompetencyAbility,
  type LearnerGradeAbility,
  type LearnerIndicatorState,
  type LearnerOutcomeAbility,
  type LearnerProfile,
  toOutcomeSeries,
  useLearningPath
} from "@chimple/palau-core";
import { OutcomeChart } from "./components/OutcomeChart";
import { RecommendationList } from "./components/RecommendationList";
import { IndicatorDependencyGraph } from "./components/IndicatorDependencyGraph";
import { sampleGrades, sampleLearnerProfile } from "./mock/sampleData";

const grades = sampleGrades;

interface AggregatedAbilities {
  outcomeAbilities: LearnerOutcomeAbility[];
  competencyAbilities: LearnerCompetencyAbility[];
  gradeAbilities: LearnerGradeAbility[];
}

const computeAggregatedThetas = (
  indicatorStates: LearnerIndicatorState[],
  gradeData: Grade[]
): AggregatedAbilities => {
  const indicatorMastery = new Map<string, number>();
  indicatorStates.forEach(state => {
    indicatorMastery.set(state.indicatorId, state.mastery ?? 0);
  });

  const outcomeAbilities = new Map<string, number>();
  const competencyAbilities = new Map<string, number>();
  const gradeAbilities = new Map<string, number>();

  gradeData.forEach(grade => {
    let gradeSum = 0;
    let gradeCount = 0;
    grade.subjects.forEach(subject => {
      subject.competencies.forEach(competency => {
        let competencySum = 0;
        let competencyCount = 0;
        competency.outcomes.forEach(outcome => {
        let outcomeSum = 0;
        let outcomeCount = 0;
        outcome.indicators.forEach(indicator => {
          const masteryValue = indicatorMastery.get(indicator.id);
          if (masteryValue !== undefined) {
            outcomeSum += masteryValue;
            outcomeCount += 1;
          }
        });
        const outcomeMastery = outcomeCount ? outcomeSum / outcomeCount : 0;
        outcomeAbilities.set(outcome.id, outcomeMastery);
        competencySum += outcomeMastery;
          competencyCount += 1;
        });
      const competencyMastery = competencyCount ? competencySum / competencyCount : 0;
      competencyAbilities.set(competency.id, competencyMastery);
      gradeSum += competencyMastery;
        gradeCount += 1;
      });
    });
  const gradeMastery = gradeCount ? gradeSum / gradeCount : 0;
  gradeAbilities.set(grade.id, gradeMastery);
  });

const mapToArray = <T extends { mastery: number }>(
  map: Map<string, number>,
  mapFn: (id: string, mastery: number) => T
): T[] => Array.from(map.entries()).map(([id, mastery]) => mapFn(id, mastery));

  return {
    outcomeAbilities: mapToArray(outcomeAbilities, (outcomeId, mastery) => ({ outcomeId, mastery })),
    competencyAbilities: mapToArray(
      competencyAbilities,
      (competencyId, mastery) => ({ competencyId, mastery })
    ),
    gradeAbilities: mapToArray(gradeAbilities, (gradeId, mastery) => ({ gradeId, mastery }))
  };
};

const buildAbilityMapsFromProfile = (profile: LearnerProfile): LearnerAbilityMaps => {
  const indicatorMap = new Map<string, number>();
  profile.indicatorStates.forEach(state => {
    indicatorMap.set(state.indicatorId, state.mastery ?? 0);
  });
  const hasIndicatorMastery = Array.from(indicatorMap.values()).some(value => value > 0);

  const outcomeMap = new Map<string, number>();
  if (!hasIndicatorMastery) {
    profile.outcomeAbilities?.forEach(ability => {
      outcomeMap.set(ability.outcomeId, ability.mastery ?? 0);
    });
  }

  const competencyMap = new Map<string, number>();
  if (!hasIndicatorMastery) {
    profile.competencyAbilities?.forEach(ability => {
      competencyMap.set(ability.competencyId, ability.mastery ?? 0);
    });
  }

  const gradeMap = new Map<string, number>();
  if (!hasIndicatorMastery) {
    profile.gradeAbilities?.forEach(ability => {
      gradeMap.set(ability.gradeId, ability.mastery ?? 0);
    });
  }
  if (!gradeMap.has(profile.gradeId)) {
    gradeMap.set(profile.gradeId, 0);
  }

  return {
    indicators: indicatorMap,
    outcomes: outcomeMap,
    competencies: competencyMap,
    grades: gradeMap
  };
};

type ViewMode = "insights" | "graph";

const App = () => {
  const [profile, setProfile] = useState<LearnerProfile>(() => ({
    ...sampleLearnerProfile,
    indicatorStates: sampleLearnerProfile.indicatorStates.map(state => ({ ...state })),
    outcomeAbilities: sampleLearnerProfile.outcomeAbilities.map(ability => ({ ...ability })),
    competencyAbilities: sampleLearnerProfile.competencyAbilities.map(ability => ({ ...ability })),
    gradeAbilities: sampleLearnerProfile.gradeAbilities.map(ability => ({ ...ability }))
  }));
  const [algorithmId, setAlgorithmId] = useState<AdaptiveAlgorithmId>("simple");
  const [view, setView] = useState<ViewMode>("insights");
  const graph = useMemo(() => buildIndicatorGraph(grades), [grades]);

  const algorithm = useMemo(() => {
    switch (algorithmId) {
      case "irt":
        return new IRTAlgorithm();
      case "elo":
        return new EloAlgorithm();
      case "bkt":
        return new BayesianKnowledgeTracingAlgorithm();
      case "modified-elo":
        return new ModifiedEloAlgorithm();
      case "simple":
      default:
        return new SimpleMasteryAlgorithm();
    }
  }, [algorithmId]);

  const handleSubmitScore = useCallback(
    (indicatorId: string, score: number) => {
      const clampedScore = Math.max(0, Math.min(1, score));
      setProfile(prev => {
        const clonedProfile: LearnerProfile = {
          ...prev,
          indicatorStates: prev.indicatorStates.map(state => ({ ...state })),
          outcomeAbilities: prev.outcomeAbilities.map(ability => ({ ...ability })),
          competencyAbilities: prev.competencyAbilities.map(ability => ({ ...ability })),
          gradeAbilities: prev.gradeAbilities.map(ability => ({ ...ability })),
          preferences: prev.preferences ? { ...prev.preferences } : prev.preferences
        };

        const indicatorContext = graph.indicators.get(indicatorId);
        if (!indicatorContext) {
          return prev;
        }

        const preAggregated = computeAggregatedThetas(clonedProfile.indicatorStates, grades);
        clonedProfile.outcomeAbilities = preAggregated.outcomeAbilities;
        clonedProfile.competencyAbilities = preAggregated.competencyAbilities;
        clonedProfile.gradeAbilities = preAggregated.gradeAbilities;

        const masteryMap = new Map<string, number>();
        clonedProfile.indicatorStates.forEach(state => {
          masteryMap.set(state.indicatorId, state.mastery);
        });

        const abilities = buildAbilityMapsFromProfile(clonedProfile);

        const algorithmContext = {
          indicator: indicatorContext,
          learnerProfile: clonedProfile,
          masteryMap,
          graph,
          abilities
        };

        const observation = {
          indicatorId,
          score: clampedScore
        };

        const result = algorithm.score(algorithmContext);

        if (typeof algorithm.update === "function") {
          algorithm.update(algorithmContext, observation, result);
        } else {
          const state = clonedProfile.indicatorStates.find(entry => entry.indicatorId === indicatorId);
          if (state) {
            state.mastery = clampedScore;
          } else {
            clonedProfile.indicatorStates.push({
              indicatorId,
              mastery: clampedScore
            });
          }
        }

        const aggregated = computeAggregatedThetas(clonedProfile.indicatorStates, grades);
        clonedProfile.outcomeAbilities = aggregated.outcomeAbilities;
        clonedProfile.competencyAbilities = aggregated.competencyAbilities;
        clonedProfile.gradeAbilities = aggregated.gradeAbilities;

        return clonedProfile;
      });
    },
    [algorithm, grades, graph]
  );

  const { recommendations } = useLearningPath({
    grades,
    learnerProfile: profile,
    options: {
      limit: 6,
      allowBlocked: false
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
              <option value="modified-elo">Modified Elo (ZPD)</option>
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
          <IndicatorDependencyGraph
            grades={grades}
            learnerProfile={profile}
            recommendations={recommendations}
            onSubmitScore={handleSubmitScore}
          />
        </section>
      )}
    </div>
  );
};

export default App;
