# @chimple/palau-recommendation

PAL (Personalised Adaptive Learning) recommendation engine utilities. It provides subject-scoped skill recommendations, ability updates, graph snapshots, and CSV helpers that power the demo app in this repo.

## Installation

```bash
npm install @chimple/palau-recommendation
# or
pnpm add @chimple/palau-recommendation
```

## Quick Start

```ts
import {
  recommendNextSkill,
  updateAbilities,
  buildGraphSnapshot,
  getSkillProbability,
  type DependencyGraph,
  type AbilityState,
} from "@chimple/palau-recommendation";

const graph: DependencyGraph = /* load or build your graph */;
const abilities: AbilityState = /* learner abilities */;

// Recommend next skill within a subject
const rec = recommendNextSkill({
  graph,
  abilities,
  subjectId: "math",
});

// Apply one or more outcome events for the recommended skill
const updated = updateAbilities({
  graph,
  abilities,
  events: [{ skillId: rec.candidateId, correct: true }],
});

// Snapshot the graph for UI/state
const snapshot = buildGraphSnapshot(graph, updated.abilities);

// Inspect probability for a specific skill
const p = getSkillProbability(graph, updated.abilities, rec.candidateId);
```

## Key APIs

- `recommendNextSkill(request)`: subject-scoped recommendation with ZPD classification.
- `updateAbilities(options)`: serially applies outcome events for a skill and returns updated abilities plus before/after snapshots.
- `buildGraphSnapshot(graph, abilities)`: aggregates probabilities and mastery bands for all skills.
- `getSkillProbability(graph, abilities, skillId)`: probability for a specific skill given current abilities.
- CSV utilities: `parseCsv`, `trimEmptyRows`, plus constants helpers in `constants.ts`.

## Data Model Notes

- A `DependencyGraph` contains skills, outcomes, competencies, domains, and subjects. Skills include `difficulty` and `prerequisites` (skill IDs).
- Abilities are stored per layer (`skill`, `outcome`, `competency`, `domain`, `subject`).
- Recommendations operate within a subject; make sure `subjectId` matches your graph entries.

## Scripts & Builds

- Build: `pnpm build` (uses tsup + tsc for types).
- Tests: `pnpm test` (vitest).
- Lint: `pnpm lint` (eslint).
