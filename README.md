# PAL Recommendation Engine

This repo hosts a miniature monorepo that contains:

- `@pal/core` – a TypeScript package with the PAL (Personalised Adaptive Learning) graph traversal logic, probability updates, and helper utilities.
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

   Visit `http://localhost:5173` to explore the dependency graph, change the active target learning indicator, and log outcomes. The recommendation panel and graph will refresh after every outcome you record.

3. Build packages:

   ```bash
   npm run build
   ```

## Package: `@pal/core`

Key exports:

```ts
import {
  recommendNextIndicator,
  updateAbilities,
  buildGraphSnapshot,
  DEFAULT_BLEND_WEIGHTS,
  DEFAULT_ZPD_RANGE,
  DEFAULT_MASTERED_THRESHOLD,
  AbilityState,
  RecommendationContext,
} from "@pal/core";
```

- `recommendNextIndicator` traverses prerequisites from a target indicator, returning the next learning indicator to test inside the ZPD window (default 0.5–0.8). It classifies results as `recommended`, `auto-mastered`, `needs-remediation`, or `no-candidate`.
- `updateAbilities` applies Elo/IRT-style ability updates across indicator, learning outcome, competency, domain, and subject layers after a correct/incorrect outcome.
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
| `sample-graph.csv` | Yes | `subjectId, subjectName, domainId, domainName, competencyId, competencyName, outcomeId, outcomeName, indicatorId, indicatorName, difficulty` |
| `sample-prerequisites.csv` | Yes | `sourceIndicatorId, targetIndicatorId` (edge points from prerequisite → dependent) |
| `sample-abilities.csv` | Optional | `type, id, ability` where `type ∈ {competency, domain, subject, outcome, indicator}` |

Drop-in replacements following the same schema will update the demo without rebuilding.

## Next Steps

- Replace the sample CSVs with your NIPUN Bharat exports to see the graph and recommendation loop with authentic data (tune β values as needed).
- Wire the `@pal/core` APIs into your assessment engine to power live lesson assignment.
- Extend the demo with server-synchronised state, richer analytics, or multi-learner comparisons.
