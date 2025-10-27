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
    probabilityKnown: toNumber(row.probabilityKnown),
    eloRating: toNumber(row.eloRating),
    successStreak: row.successStreak ? Number(row.successStreak) : undefined,
    failureStreak: row.failureStreak ? Number(row.failureStreak) : undefined,
    lastPracticedAt: row.lastPracticedAt,
    attempts: row.attempts ? Number(row.attempts) : undefined
  }));

export const sampleLearnerProfile: LearnerProfile = {
  id: "learner-1",
  gradeId: "grade-3",
  indicatorStates: learnerStates,
  preferences: {
    pace: "standard",
    focusSubjects: ["math", "literacy"]
  }
};
