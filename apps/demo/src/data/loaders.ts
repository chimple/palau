import {
  createEmptyAbilityState,
  applyCoreConstantsCsv,
  parseCsv,
  trimEmptyRows,
  type AbilityState,
  type CsvRow,
  type DependencyGraph,
  type Skill,
} from "@chimple/palau-recommendation";

import sampleGraphCsv from "./sample-graph.csv?raw";
import samplePrerequisitesCsv from "./sample-prerequisites.csv?raw";
import sampleMathGraphCsv from "./sample-graph-math.csv?raw";
import sampleMathPrerequisitesCsv from "./sample-prerequisites-math.csv?raw";
import sampleAbilitiesCsv from "./sample-abilities.csv?raw";
import sampleConstantsCsv from "./sample-constants.csv?raw";

export interface DatasetBundle {
  graph: DependencyGraph;
  abilities: AbilityState;
}

export type BuiltInDatasetId = "english" | "math";

export interface BuiltInDatasetOption {
  id: BuiltInDatasetId;
  label: string;
}

const BUILT_IN_DATASET_OPTIONS: BuiltInDatasetOption[] = [
  { id: "english", label: "English" },
  { id: "math", label: "Maths" },
];

const normalizeLookupValue = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeCsvCell = (value: string): string => {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const serializeCsv = (rows: string[][]): string =>
  rows
    .map((row) => row.map((cell) => escapeCsvCell(cell ?? "")).join(","))
    .join("\n");

const getColumnIndex = (header: CsvRow, labels: string[]): number => {
  const normalizedHeader = header.map((cell) => normalizeLookupValue(cell));
  return normalizedHeader.findIndex((value) =>
    labels.some((label) => value === normalizeLookupValue(label))
  );
};

const convertPalNumeracyGraphCsv = (rawCsv: string): string => {
  const rows = trimEmptyRows(parseCsv(rawCsv));
  if (rows.length <= 1) {
    throw new Error("Math graph CSV is empty or missing data rows.");
  }

  const [header, ...dataRows] = rows;
  const domainIdx = getColumnIndex(header, ["domain"]);
  const competencyIdx = getColumnIndex(header, ["competency"]);
  const outcomeIdx = getColumnIndex(header, ["outcome"]);
  const skillIdx = getColumnIndex(header, ["skill"]);
  const difficultyIdx = getColumnIndex(header, ["difficulty_score"]);

  if (
    domainIdx < 0 ||
    competencyIdx < 0 ||
    outcomeIdx < 0 ||
    skillIdx < 0 ||
    difficultyIdx < 0
  ) {
    throw new Error(
      "Math graph CSV must include Domain, Competency, Outcome, Skill, and Difficulty_Score columns."
    );
  }

  const bySkill = new Map<
    string,
    {
      domainId: string;
      competencyId: string;
      outcomeId: string;
      skillId: string;
      difficulty: number;
    }
  >();

  for (const row of dataRows) {
    const domainId = (row[domainIdx] ?? "").trim();
    const competencyId = (row[competencyIdx] ?? "").trim();
    const outcomeId = (row[outcomeIdx] ?? "").trim();
    const skillId = (row[skillIdx] ?? "").trim();
    const difficultyText = (row[difficultyIdx] ?? "").trim();
    if (!domainId || !competencyId || !outcomeId || !skillId) {
      continue;
    }
    const difficulty = Number(difficultyText || "0");
    const safeDifficulty = Number.isFinite(difficulty) ? difficulty : 0;
    const existing = bySkill.get(skillId);
    if (!existing) {
      bySkill.set(skillId, {
        domainId,
        competencyId,
        outcomeId,
        skillId,
        difficulty: safeDifficulty,
      });
      continue;
    }
    existing.difficulty = Math.max(existing.difficulty, safeDifficulty);
  }

  const internalRows: string[][] = [
    [
      "subjectId",
      "subjectName",
      "domainId",
      "domainName",
      "competencyId",
      "competencyName",
      "learningOutcomeId",
      "learningOutcomeName",
      "indicatorId",
      "indicatorName",
      "difficulty",
    ],
  ];

  for (const item of bySkill.values()) {
    internalRows.push([
      "Mathematics",
      "Mathematics",
      item.domainId,
      item.domainId,
      item.competencyId,
      item.competencyId,
      item.outcomeId,
      item.outcomeId,
      item.skillId,
      item.skillId,
      String(item.difficulty),
    ]);
  }

  return serializeCsv(internalRows);
};

const convertPalNumeracyPrerequisitesCsv = (rawCsv: string): string => {
  const rows = trimEmptyRows(parseCsv(rawCsv));
  if (rows.length <= 1) {
    throw new Error("Math prerequisite CSV is empty or missing data rows.");
  }

  const [header, ...dataRows] = rows;
  const sourceIdx = getColumnIndex(header, ["source"]);
  const targetIdx = getColumnIndex(header, ["target"]);
  if (sourceIdx < 0 || targetIdx < 0) {
    throw new Error(
      "Math prerequisite CSV must include Source and Target columns."
    );
  }

  const internalRows: string[][] = [["sourceSkillId", "targetSkillId"]];
  for (const row of dataRows) {
    const sourceId = (row[sourceIdx] ?? "").trim();
    const targetId = (row[targetIdx] ?? "").trim();
    if (!sourceId || !targetId) {
      continue;
    }
    internalRows.push([sourceId, targetId]);
  }
  return serializeCsv(internalRows);
};

const getBuiltInDatasetCsv = (id: BuiltInDatasetId) => {
  switch (id) {
    case "math":
      return {
        graphCsv: convertPalNumeracyGraphCsv(sampleMathGraphCsv),
        prerequisitesCsv: convertPalNumeracyPrerequisitesCsv(
          sampleMathPrerequisitesCsv
        ),
      };
    case "english":
    default:
      return {
        graphCsv: sampleGraphCsv,
        prerequisitesCsv: samplePrerequisitesCsv,
        abilityCsv: sampleAbilitiesCsv,
      };
  }
};

const createDefaultAbilitiesForGraph = (graph: DependencyGraph): AbilityState => {
  const state = createEmptyAbilityState();
  for (const subject of graph.subjects) {
    state.subject[subject.id] = state.subject[subject.id] ?? 0;
  }
  for (const domain of graph.domains) {
    state.domain[domain.id] = state.domain[domain.id] ?? 0;
  }
  for (const competency of graph.competencies) {
    state.competency[competency.id] = state.competency[competency.id] ?? 0;
  }
  for (const outcome of graph.outcomes) {
    state.outcome[outcome.id] = state.outcome[outcome.id] ?? 0;
  }
  for (const skill of graph.skills) {
    state.skill[skill.id] = state.skill[skill.id] ?? 0;
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
  const subjectsMap = new Map<
    string,
    { id: string; label: string }
  >();
  const domainsMap = new Map<
    string,
    { id: string; label: string; subjectId: string }
  >();
  const competenciesMap = new Map<
    string,
    {
      id: string;
      label: string;
      subjectId: string;
      domainId: string;
    }
  >();
  const outcomesMap = new Map<
    string,
    {
      id: string;
      label: string;
      competencyId: string;
      domainId: string;
      subjectId: string;
    }
  >();
  const skills: Skill[] = [];
  const skillIndex = new Map<string, Skill>();

  for (const row of dataRows) {
    if (row.length < 11) {
      throw new Error(
        "Each graph row must contain 11 columns (see header specification)."
      );
    }

    const [
      subjectId,
      subjectName,
      domainId,
      domainName,
      competencyId,
      competencyName,
      outcomeId,
      outcomeName,
      skillId,
      skillName,
      difficultyText,
    ] = row.map((cell) => cell.trim());

    if (
      !subjectId ||
      !domainId ||
      !competencyId ||
      !outcomeId ||
      !skillId
    ) {
      throw new Error("Graph rows must include non-empty IDs for all entities.");
    }

    const normalizedDifficultyText = difficultyText.replace(",", ".").trim();
    const difficulty = Number(normalizedDifficultyText);
    if (!Number.isFinite(difficulty)) {
      throw new Error(
        `Difficulty must be numeric. Check skill "${skillId}" (received "${difficultyText}").`
      );
    }

    if (!subjectsMap.has(subjectId)) {
      subjectsMap.set(subjectId, {
        id: subjectId,
        label: subjectName || subjectId,
      });
    }

    if (!domainsMap.has(domainId)) {
      domainsMap.set(domainId, {
        id: domainId,
        label: domainName || domainId,
        subjectId,
      });
    }

    if (!competenciesMap.has(competencyId)) {
      competenciesMap.set(competencyId, {
        id: competencyId,
        label: competencyName || competencyId,
        subjectId,
        domainId,
      });
    }

    if (!outcomesMap.has(outcomeId)) {
      outcomesMap.set(outcomeId, {
        id: outcomeId,
        label: outcomeName || outcomeId,
        competencyId,
        domainId,
        subjectId,
      });
    }

    if (skillIndex.has(skillId)) {
      throw new Error(`Duplicate skill ID detected: "${skillId}".`);
    }

    const skill: Skill = {
      id: skillId,
      label: skillName || skillId,
      subjectId,
      competencyId,
      domainId,
      outcomeId,
      difficulty,
      prerequisites: [],
    };

    skills.push(skill);
    skillIndex.set(skillId, skill);
  }

  const prereqData = trimEmptyRows(prerequisiteRows);
  if (prereqData.length === 0) {
    throw new Error("Prerequisite CSV must include a header row.");
  }
  const resolveSkillId = (() => {
    const byNormalized = new Map<string, string>();
    for (const skill of skills) {
      byNormalized.set(normalizeLookupValue(skill.id), skill.id);
      byNormalized.set(normalizeLookupValue(skill.label ?? skill.id), skill.id);
    }
    return (rawId: string): string => {
      const trimmed = rawId.trim();
      if (skillIndex.has(trimmed)) {
        return trimmed;
      }
      return byNormalized.get(normalizeLookupValue(trimmed)) ?? "";
    };
  })();
  const [, ...prereqRowsData] = prereqData;
  for (const row of prereqRowsData) {
    if (row.length < 2) {
      throw new Error(
        "Prerequisite rows must contain sourceSkillId,targetSkillId."
      );
    }
    const [rawSourceId, rawTargetId] = row.map((cell) => cell.trim());
    if (!rawSourceId || !rawTargetId) {
      continue;
    }
    const sourceId = resolveSkillId(rawSourceId);
    const targetId = resolveSkillId(rawTargetId);
    const targetSkill = skillIndex.get(targetId);
    if (!sourceId || !targetSkill) {
      continue;
    }
    targetSkill.prerequisites = Array.from(
      new Set([...targetSkill.prerequisites, sourceId])
    );
  }

  const startSkill =
    skills.find((skill) => skill.prerequisites.length === 0) ??
    skills[0];

  return {
    startSkillId: startSkill ? startSkill.id : "",
    skills,
    subjects: Array.from(subjectsMap.values()),
    domains: Array.from(domainsMap.values()),
    competencies: Array.from(competenciesMap.values()),
    outcomes: Array.from(outcomesMap.values()),
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
    case "competency":
      state.competency[id] = safeAbility;
      break;
    case "domain":
      state.domain[id] = safeAbility;
      break;
    case "subject":
      state.subject[id] = safeAbility;
      break;
    case "outcome":
      state.outcome[id] = safeAbility;
      break;
    case "skill":
      state.skill[id] = safeAbility;
      break;
    default:
      throw new Error(
        `Unknown ability type "${type}". Expected competency | domain | subject | outcome | skill.`
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
  return loadDatasetFromCsv(getBuiltInDatasetCsv("english"));
};

export const getBuiltInDatasetOptions = (): BuiltInDatasetOption[] =>
  BUILT_IN_DATASET_OPTIONS.slice();

export const getBuiltInDataset = (id: BuiltInDatasetId): DatasetBundle => {
  applyDefaultConstants();
  return loadDatasetFromCsv(getBuiltInDatasetCsv(id));
};

export const cloneAbilities = (abilities: AbilityState): AbilityState => ({
  skill: { ...abilities.skill },
  outcome: { ...abilities.outcome },
  competency: { ...abilities.competency },
  domain: { ...abilities.domain },
  subject: { ...abilities.subject },
});

export const selectDefaultTargetSkill = (graph: DependencyGraph): string => {
  if (graph.skills.length === 0) {
    return "";
  }
  const sorted = [...graph.skills].sort(
    (a, b) => (b.difficulty ?? 0) - (a.difficulty ?? 0)
  );
  return sorted[0]?.id ?? graph.skills[0].id;
};
