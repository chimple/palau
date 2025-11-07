import { recommendNextIndicator } from '../packages/pal-core/src/recommendation';
import { DEFAULT_ZPD_RANGE, DEFAULT_MASTERED_THRESHOLD } from '../packages/pal-core/src/constants';

// Minimal graph matching types
const graph = {
  indicators: [
    { id: 'A', label: 'A', learningOutcomeId: 'lo1', competencyId: 'c1', gradeId: 'g1', difficulty: 0, prerequisites: [] },
    { id: 'B', label: 'B', learningOutcomeId: 'lo1', competencyId: 'c1', gradeId: 'g1', difficulty: 0, prerequisites: ['A'] },
    { id: 'C', label: 'C', learningOutcomeId: 'lo1', competencyId: 'c1', gradeId: 'g1', difficulty: 0, prerequisites: ['A'] },
  ],
  learningOutcomes: [{ id: 'lo1', label: 'LO1', competencyId: 'c1' }],
  competencies: [{ id: 'c1', label: 'C1', gradeId: 'g1' }],
  grades: [{ id: 'g1', label: 'G1' }],
  startIndicatorId: 'A',
};

const logit = (p: number) => Math.log(p / (1 - p));

// Desired probabilities
const pA = 0.85; // target A mastered (>0.8)
const pB = 0.75; // in ZPD (0.5-0.8), closer to 0.8 than C
const pC = 0.70; // in ZPD

// Build abilities object with indicator abilities set so logistic(theta - difficulty) = p
const abilities = {
  indicator: {
    A: logit(pA),
    B: logit(pB),
    C: logit(pC),
  },
  outcome: {},
  competency: {},
  grade: {},
};

const req = {
  graph,
  abilities,
  targetIndicatorId: 'A',
  blendWeights: { indicator: 1, outcome: 0, competency: 0, grade: 0 },
  // Use default blend weights by leaving undefined; our theta values are direct
};

const rec = recommendNextIndicator(req as any);
console.log('Recommendation:', rec);
console.log('DEFAULT_ZPD_RANGE,MASTERED_THRESHOLD', DEFAULT_ZPD_RANGE, DEFAULT_MASTERED_THRESHOLD);
