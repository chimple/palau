# PAL Recommendation Engine

This repo hosts a miniature monorepo that contains:

- `@chimple/palau-recommendation` – a TypeScript package with the PAL (Personalised Adaptive Learning) graph traversal logic, probability updates, and helper utilities.
- `apps/demo` – a Vite + React demo that visualises a dependency graph, surfaces the next recommendation, and lets you log learner outcomes to see real-time updates.

## Getting Started

1. Install dependencies (workspace root):

   ```bash
   npm install
   ```

2. Start the interactive demo:

   ```bash
   npm run dev
   ```

   Visit `http://localhost:5173` to explore the dependency graph, change the active target learning skill, and log outcomes. The recommendation panel and graph will refresh after every outcome you record.

3. Build packages:

   ```bash
   npm run build
   ```

## Package: `@chimple/palau-recommendation`

Key exports:

```ts
import {
  recommendNextSkill,
  updateAbilities,
  buildGraphSnapshot,
  DEFAULT_BLEND_WEIGHTS,
  DEFAULT_ZPD_RANGE,
  DEFAULT_MASTERED_THRESHOLD,
  AbilityState,
  RecommendationContext,
} from "@chimple/palau-recommendation";
```

- `recommendNextSkill` traverses prerequisites within a subject and can be anchored to a `targetSkillId`, returning the next learning skill to test inside the ZPD window (default 0.5–0.8). It classifies results as `recommended`, `auto-mastered`, `needs-remediation`, or `no-candidate`.
- `updateAbilities` applies Elo/IRT-style ability updates across skill, learning outcome, competency, domain, and subject layers after a correct/incorrect outcome.
- `buildGraphSnapshot` aggregates predicted probabilities across the full dependency graph for visualisation.
- Combine these utilities with your own CSV data exports to drive bespoke lesson assignment flows.

## Demo Highlights

- Switch targets to reopen gates and test the traversal path the engine follows.
- Record outcomes to adjust all ability layers and instantly recompute the recommendation.
- View the dependency graph with colour-coded mastery/ZPD bands and the current recommendation highlighted.
- Load custom data by providing three CSV files (graph, prerequisites, abilities) and watch the UI rebuild the adaptive path instantly.

### CSV Format Reference

| File | Required | Columns |
| --- | --- | --- |
| `sample-graph.csv` | Yes | `subjectId, subjectName, domainId, domainName, competencyId, competencyName, outcomeId, outcomeName, skillId, skillName, difficulty` |
| `sample-prerequisites.csv` | Yes | `sourceSkillId, targetSkillId` (edge points from prerequisite → dependent) |
| `sample-abilities.csv` | Optional | `type, id, ability` where `type ∈ {competency, domain, subject, outcome, skill}` |
| `sample-assessment-batch.csv` | Optional demo input | `student_id, name, activities_scores, Order` where `name` resolves to a skill label/id and `activities_scores` is a sequence containing `0/1` outcomes |

Drop-in replacements following the same schema will update the demo without rebuilding.

### Assessment Batch Flow

The demo includes a batch replay panel that turns uploaded assessment rows into recommendations.

Input row semantics:

- `student_id`: groups all rows for one learner.
- `name`: matched against the graph skill id/label; this identifies which skill the learner was assessed on.
- `activities_scores`: every `0` or `1` becomes one outcome event for that skill.
- `Order`: controls the replay order across rows for the same learner.

Runtime flow:

1. The demo parses the uploaded CSV/TSV into rows.
2. For each learner, it replays every `0/1` score as an `updateAbilities(...)` call on the same graph.
3. After all rows for that learner are applied, it computes a target skill using the active selection policy.
4. It calls `recommendNextSkill(...)` with the learner's final ability state and emits one output row per learner.

That means the npm package is not doing batch ingestion directly. The demo is the orchestration layer, and the package provides the two core primitives:

- `updateAbilities(...)`: updates latent ability across skill, outcome, competency, domain, and subject after each outcome.
- `recommendNextSkill(...)`: traverses the dependency graph and returns the best next skill for the learner's current state.

## Next Steps

- Replace the sample CSVs with your NIPUN Bharat exports to see the graph and recommendation loop with authentic data (tune β values as needed).
- Wire the `@chimple/palau-recommendation` APIs into your assessment engine to power live lesson assignment.
- Extend the demo with server-synchronised state, richer analytics, or multi-learner comparisons.
