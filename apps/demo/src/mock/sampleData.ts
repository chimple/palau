import Papa from "papaparse";
import type { Grade, LearnerProfile, LearningIndicatorDependency } from "@chimple/palau-core";
import indicatorCsv from "./sampleData.csv?raw";
import subjectDependenciesCsv from "./subjectDependencies.csv?raw";
import learnerProfileCsv from "./learnerProfile.csv?raw";

interface CsvRow {
  gradeId: string;
  gradeLabel: string;
  subjectId: string;
  subjectName: string;
  competencyId: string;
  competencyName: string;
  outcomeId: string;
  outcomeName: string;
  indicatorId: string;
  indicatorName: string;
  weight: string;
  difficulty?: string;
  progress?: string;
  estimatedMinutes?: string;
  discrimination?: string;
  guessing?: string;
  slip?: string;
}

interface SubjectDependencyRow {
  subjectId: string;
  sourceIndicatorId: string;
  targetIndicatorId: string;
  type: LearningIndicatorDependency["type"];
}

interface LearnerProfileRow {
  indicatorId: string;
  mastery: string;
  probabilityKnown?: string;
  eloRating?: string;
  successStreak?: string;
  failureStreak?: string;
  lastPracticedAt?: string;
  attempts?: string;
}

const subjectDependencyMap = new Map<string, LearningIndicatorDependency[]>();

Papa.parse<SubjectDependencyRow>(subjectDependenciesCsv.trim(), {
  header: true,
  skipEmptyLines: true
}).data.forEach(row => {
  if (!row.subjectId || !row.sourceIndicatorId || !row.targetIndicatorId) {
    return;
  }
  const deps = subjectDependencyMap.get(row.subjectId) ?? [];
  deps.push({
    sourceIndicatorId: row.sourceIndicatorId,
    targetIndicatorId: row.targetIndicatorId,
    type: row.type ?? "prerequisite"
  });
  subjectDependencyMap.set(row.subjectId, deps);
});

const toNumber = (value?: string): number | undefined => {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const rows = Papa.parse<CsvRow>(indicatorCsv.trim(), {
  header: true,
  skipEmptyLines: true
}).data.filter(row => row.indicatorId);

const buildGrades = (): Grade[] => {
  const gradeMap = new Map<string, Grade>();

  rows.forEach(row => {
    let grade = gradeMap.get(row.gradeId);
    if (!grade) {
      grade = {
        id: row.gradeId,
        label: row.gradeLabel,
        subjects: []
      };
      gradeMap.set(row.gradeId, grade);
    }

    let subject = grade.subjects.find(s => s.id === row.subjectId);
    if (!subject) {
      subject = {
        id: row.subjectId,
        name: row.subjectName,
        competencies: [],
        indicatorDependencies: subjectDependencyMap.get(row.subjectId)?.map(dep => ({ ...dep })) ?? []
      };
      grade.subjects.push(subject);
    }

    let competency = subject.competencies.find(c => c.id === row.competencyId);
    if (!competency) {
      competency = {
        id: row.competencyId,
        name: row.competencyName,
        outcomes: []
      };
      subject.competencies.push(competency);
    }

    let outcome = competency.outcomes.find(o => o.id === row.outcomeId);
    if (!outcome) {
      outcome = {
        id: row.outcomeId,
        name: row.outcomeName,
        indicators: []
      };
      competency.outcomes.push(outcome);
    }

    outcome.indicators.push({
      id: row.indicatorId,
      description: row.indicatorName,
      weight: toNumber(row.weight) ?? 1,
      difficulty: toNumber(row.difficulty),
      progress: toNumber(row.progress),
      estimatedMinutes: row.estimatedMinutes ? Number(row.estimatedMinutes) : undefined,
      discrimination: toNumber(row.discrimination) ?? 1.0,
      guessing: toNumber(row.guessing) ?? 0.2,
      slip: toNumber(row.slip) ?? 0.1
    });
  });

  return Array.from(gradeMap.values());
};

export const sampleGrades: Grade[] = buildGrades();

const learnerStates = Papa.parse<LearnerProfileRow>(learnerProfileCsv.trim(), {
  header: true,
  skipEmptyLines: true
}).data
  .filter(row => row.indicatorId)
  .map(row => ({
    indicatorId: row.indicatorId,
    mastery: toNumber(row.mastery) ?? 0,
    theta: toNumber(row.mastery) ?? 0,
    probabilityKnown: toNumber(row.probabilityKnown),
    eloRating: toNumber(row.eloRating),
    successStreak: row.successStreak ? Number(row.successStreak) : undefined,
    failureStreak: row.failureStreak ? Number(row.failureStreak) : undefined,
    lastPracticedAt: row.lastPracticedAt,
    attempts: row.attempts ? Number(row.attempts) : undefined
  }));

const indicatorThetaLookup = new Map<string, number>();
learnerStates.forEach(state => {
  indicatorThetaLookup.set(state.indicatorId, state.theta ?? state.mastery ?? 0);
});

const outcomeAbilities = new Map<string, number>();
const competencyAbilities = new Map<string, number>();
const gradeAbilities = new Map<string, number>();

sampleGrades.forEach(grade => {
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
          const theta = indicatorThetaLookup.get(indicator.id);
          if (theta !== undefined) {
            outcomeSum += theta;
            outcomeCount += 1;
          }
        });
        const outcomeTheta = outcomeCount ? outcomeSum / outcomeCount : 0;
        outcomeAbilities.set(outcome.id, outcomeTheta);
        competencySum += outcomeTheta;
        competencyCount += 1;
      });
      const competencyTheta = competencyCount ? competencySum / competencyCount : 0;
      competencyAbilities.set(competency.id, competencyTheta);
      gradeSum += competencyTheta;
      gradeCount += 1;
    });
  });
  const gradeTheta = gradeCount ? gradeSum / gradeCount : 0;
  gradeAbilities.set(grade.id, gradeTheta);
});

const toAbilityArray = <T extends { theta: number }>(map: Map<string, number>, key: (id: string, theta: number) => T) =>
  Array.from(map.entries()).map(([id, theta]) => key(id, theta));

export const sampleLearnerProfile: LearnerProfile = {
  id: "learner-1",
  gradeId: "grade-3",
  indicatorStates: learnerStates,
  outcomeAbilities: toAbilityArray(outcomeAbilities, (outcomeId, theta) => ({ outcomeId, theta })),
  competencyAbilities: toAbilityArray(
    competencyAbilities,
    (competencyId, theta) => ({ competencyId, theta })
  ),
  gradeAbilities: toAbilityArray(gradeAbilities, (gradeId, theta) => ({ gradeId, theta })),
  preferences: {
    pace: "standard",
    focusSubjects: ["math", "literacy"]
  }
};
