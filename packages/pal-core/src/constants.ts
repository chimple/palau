import { parseCsv, trimEmptyRows } from "./csv";
import type { AbilityState, BlendWeights, LearningRates } from "./types";

export interface CoreConstants {
  blendWeights: BlendWeights;
  learningRates: LearningRates;
  zpdRange: [number, number];
  masteredThreshold: number;
  scale: number;
}

export interface CoreConstantsUpdate {
  blendWeights?: Partial<BlendWeights>;
  learningRates?: Partial<LearningRates>;
  zpdRange?: [number, number];
  masteredThreshold?: number;
  scale?: number;
}

const INITIAL_CORE_CONSTANTS: CoreConstants = {
  blendWeights: {
    skill: 0.35,
    outcome: 0.2,
    competency: 0.18,
    domain: 0.12,
    subject: 0.15,
  },
  learningRates: {
    skill: 0.5,
    outcome: 0.08,
    competency: 0.04,
    domain: 0.04,
    subject: 0.05,
  },
  zpdRange: [0.5, 0.8],
  masteredThreshold: 0.8,
  scale: 1,
};

let currentCoreConstants: CoreConstants = {
  blendWeights: { ...INITIAL_CORE_CONSTANTS.blendWeights },
  learningRates: { ...INITIAL_CORE_CONSTANTS.learningRates },
  zpdRange: [...INITIAL_CORE_CONSTANTS.zpdRange] as [number, number],
  masteredThreshold: INITIAL_CORE_CONSTANTS.masteredThreshold,
  scale: INITIAL_CORE_CONSTANTS.scale,
};

const cloneBlendWeights = (weights: BlendWeights): BlendWeights => ({
  skill: weights.skill,
  outcome: weights.outcome,
  competency: weights.competency,
  domain: weights.domain,
  subject: weights.subject,
});

const cloneLearningRates = (rates: LearningRates): LearningRates => ({
  skill: rates.skill,
  outcome: rates.outcome,
  competency: rates.competency,
  domain: rates.domain,
  subject: rates.subject,
});

const cloneZpdRange = (range: [number, number]): [number, number] => [
  range[0],
  range[1],
];

const freezeBlendWeights = (weights: BlendWeights): BlendWeights =>
  Object.freeze(cloneBlendWeights(weights)) as BlendWeights;

const freezeLearningRates = (rates: LearningRates): LearningRates =>
  Object.freeze(cloneLearningRates(rates)) as LearningRates;

const freezeZpdRange = (range: [number, number]): [number, number] =>
  Object.freeze(cloneZpdRange(range)) as [number, number];

export let DEFAULT_BLEND_WEIGHTS: BlendWeights = freezeBlendWeights(
  currentCoreConstants.blendWeights
);

export let DEFAULT_LEARNING_RATES: LearningRates = freezeLearningRates(
  currentCoreConstants.learningRates
);

export let DEFAULT_ZPD_RANGE: [number, number] = freezeZpdRange(
  currentCoreConstants.zpdRange
);

export let DEFAULT_MASTERED_THRESHOLD = currentCoreConstants.masteredThreshold;
export let DEFAULT_SCALE = currentCoreConstants.scale;

const syncDefaultViews = () => {
  DEFAULT_BLEND_WEIGHTS = freezeBlendWeights(currentCoreConstants.blendWeights);
  DEFAULT_LEARNING_RATES = freezeLearningRates(
    currentCoreConstants.learningRates
  );
  DEFAULT_ZPD_RANGE = freezeZpdRange(currentCoreConstants.zpdRange);
  DEFAULT_MASTERED_THRESHOLD = currentCoreConstants.masteredThreshold;
  DEFAULT_SCALE = currentCoreConstants.scale;
};

const ensureFinite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
};

export const getCoreConstants = (): CoreConstants => ({
  blendWeights: cloneBlendWeights(currentCoreConstants.blendWeights),
  learningRates: cloneLearningRates(currentCoreConstants.learningRates),
  zpdRange: cloneZpdRange(currentCoreConstants.zpdRange),
  masteredThreshold: currentCoreConstants.masteredThreshold,
  scale: currentCoreConstants.scale,
});

export const resetCoreConstants = (): CoreConstants => {
  currentCoreConstants = {
    blendWeights: { ...INITIAL_CORE_CONSTANTS.blendWeights },
    learningRates: { ...INITIAL_CORE_CONSTANTS.learningRates },
    zpdRange: cloneZpdRange(INITIAL_CORE_CONSTANTS.zpdRange),
    masteredThreshold: INITIAL_CORE_CONSTANTS.masteredThreshold,
    scale: INITIAL_CORE_CONSTANTS.scale,
  };
  syncDefaultViews();
  return getCoreConstants();
};

export const updateCoreConstants = (
  updates: CoreConstantsUpdate
): CoreConstants => {
  if (updates.blendWeights) {
    const next = {
      ...currentCoreConstants.blendWeights,
      ...updates.blendWeights,
    } satisfies BlendWeights;
    currentCoreConstants.blendWeights = {
      skill: ensureFinite(next.skill, "Blend weight (skill)"),
      outcome: ensureFinite(next.outcome, "Blend weight (outcome)"),
      competency: ensureFinite(next.competency, "Blend weight (competency)"),
      domain: ensureFinite(next.domain, "Blend weight (domain)"),
      subject: ensureFinite(next.subject, "Blend weight (subject)"),
    };
  }

  if (updates.learningRates) {
    const next = {
      ...currentCoreConstants.learningRates,
      ...updates.learningRates,
    } satisfies LearningRates;
    currentCoreConstants.learningRates = {
      skill: ensureFinite(next.skill, "Learning rate (skill)"),
      outcome: ensureFinite(next.outcome, "Learning rate (outcome)"),
      competency: ensureFinite(
        next.competency,
        "Learning rate (competency)"
      ),
      domain: ensureFinite(next.domain, "Learning rate (domain)"),
      subject: ensureFinite(next.subject, "Learning rate (subject)"),
    };
  }

  if (updates.zpdRange) {
    if (updates.zpdRange.length !== 2) {
      throw new Error("ZPD range must have exactly two numeric entries.");
    }
    const min = ensureFinite(updates.zpdRange[0], "ZPD range minimum");
    const max = ensureFinite(updates.zpdRange[1], "ZPD range maximum");
    currentCoreConstants.zpdRange = [min, max];
  }

  if (typeof updates.masteredThreshold === "number") {
    currentCoreConstants.masteredThreshold = ensureFinite(
      updates.masteredThreshold,
      "Mastered threshold"
    );
  }

  if (typeof updates.scale === "number") {
    currentCoreConstants.scale = ensureFinite(updates.scale, "Scale");
  }

  syncDefaultViews();
  return getCoreConstants();
};

const normalizeToken = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const parseNumericCell = (value: string, label: string): number => {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be numeric.`);
  }
  return numeric;
};

export const parseCoreConstantsCsv = (
  csvText: string
): CoreConstantsUpdate => {
  const rows = trimEmptyRows(parseCsv(csvText));
  if (rows.length === 0) {
    throw new Error("Constants CSV is empty.");
  }

  const [headerRaw, ...dataRows] = rows;
  const header = headerRaw.map((cell) => normalizeToken(cell));
  if (header.length < 3) {
    throw new Error(
      "Constants CSV header must include at least category,key,value columns."
    );
  }

  if (
    header[0] !== "category" ||
    header[1] !== "key" ||
    header[2] !== "value"
  ) {
    throw new Error(
      'Constants CSV header must start with "category,key,value" (case insensitive).'
    );
  }

  const blendWeights: Partial<BlendWeights> = {};
  const learningRates: Partial<LearningRates> = {};
  let zpdMin: number | undefined;
  let zpdMax: number | undefined;
  let mastered: number | undefined;
  let scale: number | undefined;

  dataRows.forEach((row, index) => {
    if (row.length < 3) {
      throw new Error(
        `Constants CSV row ${index + 2} must include category,key,value.`
      );
    }
    const [rawCategory, rawKey, rawValue] = row;
    const category = normalizeToken(rawCategory);
    const key = normalizeToken(rawKey);
    const value = rawValue.trim();

    switch (category) {
      case "blendweights":
        switch (key) {
          case "skill":
          case "outcome":
          case "competency":
          case "domain":
          case "subject":
            blendWeights[key] = parseNumericCell(
              value,
              `Blend weight (${key})`
            );
            break;
          default:
            throw new Error(
              `Unknown blend weight key "${rawKey}" on row ${index + 2}.`
            );
        }
        break;
      case "learningrates":
        switch (key) {
          case "skill":
          case "outcome":
          case "competency":
          case "domain":
          case "subject":
            learningRates[key] = parseNumericCell(
              value,
              `Learning rate (${key})`
            );
            break;
          default:
            throw new Error(
              `Unknown learning rate key "${rawKey}" on row ${index + 2}.`
            );
        }
        break;
      case "zpdrange": {
        if (key === "min" || key === "lower") {
          zpdMin = parseNumericCell(value, "ZPD range minimum");
        } else if (key === "max" || key === "upper") {
          zpdMax = parseNumericCell(value, "ZPD range maximum");
        } else {
          throw new Error(
            `Unknown ZPD range key "${rawKey}" on row ${index + 2}.`
          );
        }
        break;
      }
      case "masteredthreshold":
        mastered = parseNumericCell(value, "Mastered threshold");
        break;
      case "scale":
        scale = parseNumericCell(value, "Scale");
        break;
      default:
        throw new Error(
          `Unknown constants category "${rawCategory}" on row ${index + 2}.`
        );
    }
  });

  const updates: CoreConstantsUpdate = {};

  if (Object.keys(blendWeights).length > 0) {
    updates.blendWeights = blendWeights;
  }

  if (Object.keys(learningRates).length > 0) {
    updates.learningRates = learningRates;
  }

  if (zpdMin !== undefined || zpdMax !== undefined) {
    const [currentMin, currentMax] = currentCoreConstants.zpdRange;
    updates.zpdRange = [zpdMin ?? currentMin, zpdMax ?? currentMax];
  }

  if (mastered !== undefined) {
    updates.masteredThreshold = mastered;
  }

  if (scale !== undefined) {
    updates.scale = scale;
  }

  return updates;
};

export const applyCoreConstantsCsv = (csvText: string): CoreConstants =>
  updateCoreConstants(parseCoreConstantsCsv(csvText));

export const createEmptyAbilityState = (): AbilityState => ({
  skill: {},
  outcome: {},
  competency: {},
  domain: {},
  subject: {},
});
