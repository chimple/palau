import { getDefaultDataset, cloneAbilities, selectDefaultTargetIndicator } from '../apps/demo/src/data/loaders';
import { recommendNextIndicator, updateAbilities } from '../packages/pal-core/src/index';

(async () => {
  const dataset = getDefaultDataset();
  const graph = dataset.graph;
  let abilities = cloneAbilities(dataset.abilities);

  const defaultTarget = selectDefaultTargetIndicator(graph);
  console.log('Default target:', defaultTarget);

  const rec1 = recommendNextIndicator({ graph, abilities, targetIndicatorId: defaultTarget });
  console.log('Initial recommendation:', rec1);

  if (rec1.candidateId) {
    console.log('\nSimulating a CORRECT outcome on candidate:', rec1.candidateId);
    const res = updateAbilities({ graph, abilities, event: { indicatorId: rec1.candidateId, correct: true, timestamp: Date.now() } });
    console.log('prob before -> after:', res.probabilityBefore.toFixed(3), '->', res.probabilityAfter.toFixed(3));
    abilities = res.abilities;

    const rec2 = recommendNextIndicator({ graph, abilities, targetIndicatorId: defaultTarget });
    console.log('\nRecommendation after correct outcome:', rec2);
  }

  console.log('\nDone');
})();
