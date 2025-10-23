# Palau Personalised Learning Workspace

This monorepo contains the core TypeScript library that powers Chimple's personalised and adaptive learning engine as well as a React demo application that visualises learning outcomes.

## Packages & Apps

- `packages/core` – publishable npm package `@chimple/palau-core` with domain models, adaptive recommendation engine, hooks, and UI helpers.
- `packages/config` – shared configuration artefacts (e.g. base TypeScript config).
- `apps/demo` – Vite powered React application showcasing the core package with sample data and a learning outcome chart.

## Getting Started

```bash
pnpm install
pnpm --filter @chimple/palau-core build
pnpm --filter demo dev
```

The demo app runs at `http://localhost:5173` and consumes the locally built core package.

## Core Highlights

- Hierarchical domain model for grades → subjects → competencies → outcomes → indicators.
- Explicit `LearningIndicatorDependency` records to encode prerequisite and reinforcement links.
- `AdaptiveEngine` class generates ordered indicator recommendations honouring dependency chains.
- Pluggable recommendation algorithms (Simple mastery, IRT, Elo, Bayesian Knowledge Tracing) with a shared strategy interface.
- `useLearningPath` React hook for directly consuming engine recommendations in UI components.
- `sampleGrades` and `sampleLearnerProfile` fixtures for prototyping or testing.

## Demo Application

The demo app renders:

- A recommendation list with mastery bars (`IndicatorProgress` component).
- A bar chart of learning outcome progress using `recharts`.
- An algorithm picker that lets you compare Simple, IRT, Elo, and BKT scoring models in real time.
- A dependency graph view that visualises indicator prerequisites using an interactive node-link diagram.

To build the app for production:

```bash
pnpm --filter demo build
```

## Scripts

- `pnpm build` – builds every workspace package/app.
- `pnpm lint` – runs ESLint across all workspaces.
- `pnpm test` – executes package-level tests (placeholder until suites are added).
- `pnpm demo` – convenience alias for `pnpm --filter demo dev`.

## Next Steps

- Add persistence/integration hooks for real learner data.
- Extend adaptive strategies (e.g. spaced repetition, effort-based pacing).
- Introduce unit tests for the recommendation engine and React components.
