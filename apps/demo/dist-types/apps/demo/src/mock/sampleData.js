import Papa from "papaparse";
import indicatorCsv from "./sampleData.csv?raw";
import subjectDependenciesCsv from "./subjectDependencies.csv?raw";
import learnerProfileCsv from "./learnerProfile.csv?raw";
const subjectDependencyMap = new Map();
Papa.parse(subjectDependenciesCsv.trim(), {
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
const toNumber = (value) => {
    if (value === undefined || value.trim() === "") {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
};
const rows = Papa.parse(indicatorCsv.trim(), {
    header: true,
    skipEmptyLines: true
}).data.filter(row => row.indicatorId);
const buildGrades = () => {
    const gradeMap = new Map();
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
export const sampleGrades = buildGrades();
const learnerStates = Papa.parse(learnerProfileCsv.trim(), {
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
const indicatorMasteryLookup = new Map();
learnerStates.forEach(state => {
    indicatorMasteryLookup.set(state.indicatorId, state.mastery ?? 0);
});
const outcomeAbilities = new Map();
const competencyAbilities = new Map();
const gradeAbilities = new Map();
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
                    const mastery = indicatorMasteryLookup.get(indicator.id);
                    if (mastery !== undefined) {
                        outcomeSum += mastery;
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
const toAbilityArray = (map, key) => Array.from(map.entries()).map(([id, mastery]) => key(id, mastery));
export const sampleLearnerProfile = {
    id: "learner-1",
    gradeId: "grade-3",
    indicatorStates: learnerStates,
    outcomeAbilities: toAbilityArray(outcomeAbilities, (outcomeId, mastery) => ({ outcomeId, mastery })),
    competencyAbilities: toAbilityArray(competencyAbilities, (competencyId, mastery) => ({ competencyId, mastery })),
    gradeAbilities: toAbilityArray(gradeAbilities, (gradeId, mastery) => ({ gradeId, mastery })),
    preferences: {
        pace: "standard",
        focusSubjects: ["math", "literacy"]
    }
};
