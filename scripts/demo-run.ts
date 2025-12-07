import { getDefaultDataset, cloneAbilities, selectDefaultTargetSkill } from '../apps/demo/src/data/loaders';
import { recommendNextSkill, updateAbilities } from '../packages/recommendation/src/index';

(async () => {
  const dataset = getDefaultDataset();
  const graph = dataset.graph;
  let abilities = cloneAbilities(dataset.abilities);

  const defaultTarget = selectDefaultTargetSkill(graph);
  console.log('Default target:', defaultTarget);

  const rec1 = recommendNextSkill({
    graph,
    abilities,
    subjectId: graph.skills.find((s) => s.id === defaultTarget)?.subjectId ?? graph.subjects[0]?.id ?? "",
  });
  console.log('Initial recommendation:', rec1);

  if (rec1.candidateId) {
    console.log('\nSimulating a CORRECT outcome on candidate:', rec1.candidateId);
    const res = updateAbilities({
      graph,
      abilities,
      events: [{ skillId: rec1.candidateId, correct: true, timestamp: Date.now() }],
    });
    console.log('prob before -> after:', res.probabilityBefore.toFixed(3), '->', res.probabilityAfter.toFixed(3));
    abilities = res.abilities;

    const rec2 = recommendNextSkill({
      graph,
      abilities,
      subjectId: graph.skills.find((s) => s.id === defaultTarget)?.subjectId ?? graph.subjects[0]?.id ?? "",
    });
    console.log('\nRecommendation after correct outcome:', rec2);
  }

  console.log('\nDone');
})();
