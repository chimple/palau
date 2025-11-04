import {
  createEmptyAbilityState,
  applyCoreConstantsCsv,
  parseCsv,
  trimEmptyRows,
  type AbilityState,
  type CsvRow,
  type DependencyGraph,
  type LearningIndicator,
} from "@pal/core";

import sampleGraphCsv from "./sample-graph.csv?raw";
import samplePrerequisitesCsv from "./sample-prerequisites.csv?raw";
import sampleAbilitiesCsv from "./sample-abilities.csv?raw";
import sampleConstantsCsv from "./sample-constants.csv?raw";

export interface DatasetBundle {
  graph: DependencyGraph;
  abilities: AbilityState;
}

const createDefaultAbilitiesForGraph = (graph: DependencyGraph): AbilityState => {
  const state = createEmptyAbilityState();
  for (const grade of graph.grades) {
    state.grade[grade.id] = state.grade[grade.id] ?? 0;
  }
  for (const competency of graph.competencies) {
    state.competency[competency.id] = state.competency[competency.id] ?? 0;
  }
  for (const outcome of graph.learningOutcomes) {
    state.outcome[outcome.id] = state.outcome[outcome.id] ?? 0;
  }
  for (const indicator of graph.indicators) {
    state.indicator[indicator.id] = state.indicator[indicator.id] ?? 0;
  }
  return state;
};

const parseGraphRows = (
  graphRows: CsvRow[],
  prerequisiteRows: CsvRow[]
): DependencyGraph => {
  const filteredRows = trimEmptyRows(graphRows);
  if (filteredRows.length <= 1) {
    throw new Error("Graph CSV is empty or missing data rows.");
  }

  const [, ...dataRows] = filteredRows;
  const gradesMap = new Map<string, { id: string; label: string }>();
  const competenciesMap = new Map<
    string,
    { id: string; label: string; gradeId: string }
  >();
  const outcomesMap = new Map<
    string,
    { id: string; label: string; competencyId: string }
  >();
  const indicators: LearningIndicator[] = [];
  const indicatorIndex = new Map<string, LearningIndicator>();

  for (const row of dataRows) {
    if (row.length < 9) {
      throw new Error(
        "Each graph row must contain 9 columns (see header specification)."
      );
    }

    const [
      gradeId,
      gradeLabel,
      competencyId,
      competencyName,
      learningOutcomeId,
      learningOutcomeName,
      indicatorId,
      indicatorName,
      difficultyText,
    ] = row.map((cell) => cell.trim());

    if (!gradeId || !competencyId || !learningOutcomeId || !indicatorId) {
      throw new Error("Graph rows must include non-empty IDs for all entities.");
    }

    const difficulty = Number.parseFloat(difficultyText);
    if (Number.isNaN(difficulty)) {
      throw new Error(
        `Difficulty must be numeric. Check indicator "${indicatorId}".`
      );
    }

    if (!gradesMap.has(gradeId)) {
      gradesMap.set(gradeId, {
        id: gradeId,
        label: gradeLabel || gradeId,
      });
    }

    if (!competenciesMap.has(competencyId)) {
      competenciesMap.set(competencyId, {
        id: competencyId,
        label: competencyName || competencyId,
        gradeId,
      });
    }

    if (!outcomesMap.has(learningOutcomeId)) {
      outcomesMap.set(learningOutcomeId, {
        id: learningOutcomeId,
        label: learningOutcomeName || learningOutcomeId,
        competencyId,
      });
    }

    if (indicatorIndex.has(indicatorId)) {
      throw new Error(`Duplicate indicator ID detected: "${indicatorId}".`);
    }

    const indicator: LearningIndicator = {
      id: indicatorId,
      label: indicatorName || indicatorId,
      gradeId,
      competencyId,
      learningOutcomeId,
      difficulty,
      prerequisites: [],
    };

    indicators.push(indicator);
    indicatorIndex.set(indicatorId, indicator);
  }

  const prereqData = trimEmptyRows(prerequisiteRows);
  if (prereqData.length === 0) {
    throw new Error("Prerequisite CSV must include a header row.");
  }
  const [, ...prereqRowsData] = prereqData;
  for (const row of prereqRowsData) {
    if (row.length < 2) {
      throw new Error(
        "Prerequisite rows must contain sourceIndicatorId,targetIndicatorId."
      );
    }
    const [sourceId, targetId] = row.map((cell) => cell.trim());
    if (!sourceId || !targetId) {
      continue;
    }
    const targetIndicator = indicatorIndex.get(targetId);
    if (!targetIndicator) {
      continue;
    }
    targetIndicator.prerequisites = Array.from(
      new Set([...targetIndicator.prerequisites, sourceId])
    );
  }

  const startIndicator =
    indicators.find((indicator) => indicator.prerequisites.length === 0) ??
    indicators[0];

  return {
    startIndicatorId: startIndicator ? startIndicator.id : "",
    indicators,
    grades: Array.from(gradesMap.values()),
    competencies: Array.from(competenciesMap.values()),
    learningOutcomes: Array.from(outcomesMap.values()),
  };
};

const applyAbilityRow = (
  state: AbilityState,
  row: CsvRow
): AbilityState => {
  if (row.length < 3) {
    throw new Error("Ability rows must include type,id,ability.");
  }
  const [type, id, abilityText] = row.map((cell) => cell.trim());
  if (!type || !id) {
    return state;
  }
  const ability = Number.parseFloat(abilityText);
  const safeAbility = Number.isNaN(ability) ? 0 : ability;
  switch (type.toLowerCase()) {
    case "grade":
      state.grade[id] = safeAbility;
      break;
    case "competency":
      state.competency[id] = safeAbility;
      break;
    case "outcome":
    case "learningoutcome":
      state.outcome[id] = safeAbility;
      break;
    case "indicator":
      state.indicator[id] = safeAbility;
      break;
    default:
      throw new Error(
        `Unknown ability type "${type}". Expected grade | competency | outcome | indicator.`
      );
  }
  return state;
};

const parseAbilityRows = (
  graph: DependencyGraph,
  abilityRows: CsvRow[]
): AbilityState => {
  const state = createDefaultAbilitiesForGraph(graph);
  const filteredRows = trimEmptyRows(abilityRows);
  if (filteredRows.length <= 1) {
    return state;
  }
  const [, ...dataRows] = filteredRows;
  for (const row of dataRows) {
    applyAbilityRow(state, row);
  }
  return state;
};

export const loadDatasetFromCsv = (options: {
  graphCsv: string;
  prerequisitesCsv: string;
  abilityCsv?: string;
}): DatasetBundle => {
  const graphRows = parseCsv(options.graphCsv);
  const prereqRows = parseCsv(options.prerequisitesCsv);
  const graph = parseGraphRows(graphRows, prereqRows);
  const abilities = options.abilityCsv
    ? parseAbilityRows(graph, parseCsv(options.abilityCsv))
    : createDefaultAbilitiesForGraph(graph);
  return {
    graph,
    abilities,
  };
};

export const applyDefaultConstants = () => {
  applyCoreConstantsCsv(sampleConstantsCsv);
};

export const getDefaultDataset = (): DatasetBundle => {
  applyDefaultConstants();
  return loadDatasetFromCsv({
    graphCsv: sampleGraphCsv,
    prerequisitesCsv: samplePrerequisitesCsv,
    abilityCsv: sampleAbilitiesCsv,
  });
};

export const cloneAbilities = (abilities: AbilityState): AbilityState => ({
  indicator: { ...abilities.indicator },
  outcome: { ...abilities.outcome },
  competency: { ...abilities.competency },
  grade: { ...abilities.grade },
});

export const selectDefaultTargetIndicator = (graph: DependencyGraph): string => {
  if (graph.indicators.length === 0) {
    return "";
  }
  const sorted = [...graph.indicators].sort(
    (a, b) => (b.difficulty ?? 0) - (a.difficulty ?? 0)
  );
  return sorted[0]?.id ?? graph.indicators[0].id;
};
