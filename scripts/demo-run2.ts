import { recommendNextSkill } from '../packages/pal-core/src/recommendation';
import { DEFAULT_ZPD_RANGE, DEFAULT_MASTERED_THRESHOLD } from '../packages/pal-core/src/constants';

// Minimal graph matching types (grade removed)
const graph = {
  skills: [
    { id: 'A', label: 'A', outcomeId: 'lo1', competencyId: 'c1', domainId: 'd1', subjectId: 's1', difficulty: 0, prerequisites: [] },
    { id: 'B', label: 'B', outcomeId: 'lo1', competencyId: 'c1', domainId: 'd1', subjectId: 's1', difficulty: 0, prerequisites: ['A'] },
    { id: 'C', label: 'C', outcomeId: 'lo1', competencyId: 'c1', domainId: 'd1', subjectId: 's1', difficulty: 0, prerequisites: ['A'] },
  ],
  outcomes: [{ id: 'lo1', label: 'LO1', competencyId: 'c1', domainId: 'd1', subjectId: 's1' }],
  competencies: [{ id: 'c1', label: 'C1', subjectId: 's1', domainId: 'd1' }],
  domains: [{ id: 'd1', label: 'D1', subjectId: 's1' }],
  subjects: [{ id: 's1', label: 'S1' }],
  startSkillId: 'A',
};

const logit = (p: number) => Math.log(p / (1 - p));

// Desired probabilities
const pA = 0.85; // target A mastered (>0.8)
const pB = 0.75; // in ZPD (0.5-0.8), closer to 0.8 than C
const pC = 0.70; // in ZPD

// Build abilities object with skill abilities set so logistic(theta - difficulty) = p
const abilities = {
  skill: {
    A: logit(pA),
    B: logit(pB),
    C: logit(pC),
  },
  outcome: {},
  competency: {},
  domain: {},
  subject: {},
};

const req = {
  graph,
  abilities,
  targetSkillId: 'A',
  blendWeights: { skill: 1, outcome: 0, competency: 0, domain: 0, subject: 0 },
  // Use default blend weights by leaving undefined; our theta values are direct
};

const rec = recommendNextSkill(req as any);
console.log('Recommendation:', rec);
console.log('DEFAULT_ZPD_RANGE,MASTERED_THRESHOLD', DEFAULT_ZPD_RANGE, DEFAULT_MASTERED_THRESHOLD);
