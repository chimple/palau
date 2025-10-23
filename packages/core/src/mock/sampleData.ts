import type { Grade, LearnerProfile } from "../domain/models";

export const sampleGrades: Grade[] = [
  {
    id: "grade-3",
    label: "Grade 3",
    subjects: [
      {
        id: "math",
        name: "Mathematics",
        competencies: [
          {
            id: "number-sense",
            name: "Number Sense",
            outcomes: [
              {
                id: "addition",
                name: "Addition Fluency",
                indicators: [
                  {
                    id: "math-add-basics",
                    description: "Add two single-digit numbers without regrouping",
                    weight: 1,
                    estimatedMinutes: 10,
                    difficulty: -1,
                    discrimination: 1.2,
                    guessing: 0.15,
                    slip: 0.05
                  },
                  {
                    id: "math-add-carry",
                    description: "Add two-digit numbers with carrying",
                    weight: 1.4,
                    estimatedMinutes: 15,
                    difficulty: 0.1,
                    discrimination: 1.35,
                    guessing: 0.2,
                    slip: 0.08
                  },
                  {
                    id: "math-add-word",
                    description: "Solve addition word problems with up to two steps",
                    weight: 1.6,
                    estimatedMinutes: 20,
                    difficulty: 0.75,
                    discrimination: 1.5,
                    guessing: 0.22,
                    slip: 0.12
                  }
                ]
              },
              {
                id: "subtraction",
                name: "Subtraction Strategies",
                indicators: [
                  {
                    id: "math-sub-basics",
                    description: "Subtract single-digit numbers without regrouping",
                    weight: 1,
                    estimatedMinutes: 10,
                    difficulty: -0.5,
                    discrimination: 1.1,
                    guessing: 0.18,
                    slip: 0.07
                  },
                  {
                    id: "math-sub-borrow",
                    description: "Subtract two-digit numbers with borrowing",
                    weight: 1.3,
                    estimatedMinutes: 15,
                    difficulty: 0.4,
                    discrimination: 1.25,
                    guessing: 0.2,
                    slip: 0.1
                  }
                ]
              }
            ]
          }
        ],
        indicatorDependencies: [
          {
            sourceIndicatorId: "math-add-basics",
            targetIndicatorId: "math-add-carry",
            type: "prerequisite"
          },
          {
            sourceIndicatorId: "math-add-carry",
            targetIndicatorId: "math-add-word",
            type: "prerequisite"
          },
          {
            sourceIndicatorId: "math-sub-basics",
            targetIndicatorId: "math-sub-borrow",
            type: "prerequisite"
          },
          {
            sourceIndicatorId: "math-add-basics",
            targetIndicatorId: "math-sub-borrow",
            type: "reinforces"
          }
        ]
      },
      {
        id: "literacy",
        name: "Literacy",
        competencies: [
          {
            id: "reading-comprehension",
            name: "Reading Comprehension",
            outcomes: [
              {
                id: "informational-text",
                name: "Informational Text",
                indicators: [
                  {
                    id: "lit-main-idea",
                    description: "Identify the main idea in informational text",
                    weight: 1.2,
                    estimatedMinutes: 12,
                    difficulty: -0.2,
                    discrimination: 1.1,
                    guessing: 0.18,
                    slip: 0.08
                  },
                  {
                    id: "lit-supporting-details",
                    description: "Find supporting details in informational text",
                    weight: 1.1,
                    estimatedMinutes: 14,
                    difficulty: 0.3,
                    discrimination: 1.2,
                    guessing: 0.2,
                    slip: 0.1
                  },
                  {
                    id: "lit-summarize",
                    description: "Summarize informational passages in own words",
                    weight: 1.5,
                    estimatedMinutes: 18,
                    difficulty: 0.9,
                    discrimination: 1.45,
                    guessing: 0.22,
                    slip: 0.13
                  }
                ]
              }
            ]
          }
        ],
        indicatorDependencies: [
          {
            sourceIndicatorId: "lit-main-idea",
            targetIndicatorId: "lit-supporting-details",
            type: "reinforces"
          },
          {
            sourceIndicatorId: "lit-supporting-details",
            targetIndicatorId: "lit-summarize",
            type: "prerequisite"
          }
        ]
      }
    ]
  }
];

export const sampleLearnerProfile: LearnerProfile = {
  id: "learner-1",
  gradeId: "grade-3",
  indicatorStates: [
    {
      indicatorId: "math-add-basics",
      mastery: 0.9,
      probabilityKnown: 0.92,
      eloRating: 1320,
      successStreak: 6
    },
    {
      indicatorId: "math-add-carry",
      mastery: 0.4,
      probabilityKnown: 0.38,
      eloRating: 1185,
      failureStreak: 2
    },
    {
      indicatorId: "math-add-word",
      mastery: 0.1,
      probabilityKnown: 0.15,
      eloRating: 1050,
      failureStreak: 3
    },
    {
      indicatorId: "math-sub-basics",
      mastery: 0.6,
      probabilityKnown: 0.58,
      eloRating: 1220,
      successStreak: 2
    },
    {
      indicatorId: "math-sub-borrow",
      mastery: 0.2,
      probabilityKnown: 0.22,
      eloRating: 1100,
      failureStreak: 4
    },
    {
      indicatorId: "lit-main-idea",
      mastery: 0.7,
      probabilityKnown: 0.68,
      eloRating: 1280,
      successStreak: 4
    },
    {
      indicatorId: "lit-supporting-details",
      mastery: 0.45,
      probabilityKnown: 0.42,
      eloRating: 1160,
      failureStreak: 1
    },
    {
      indicatorId: "lit-summarize",
      mastery: 0.2,
      probabilityKnown: 0.25,
      eloRating: 1090,
      failureStreak: 2
    }
  ],
  preferences: {
    pace: "standard",
    focusSubjects: ["math", "literacy"]
  }
};
