import type {
  Grade,
  LearningIndicator,
  LearningIndicatorDependency,
  LearningOutcome
} from "./models";

export interface IndicatorContext {
  indicator: LearningIndicator;
  outcome: LearningOutcome;
  dependencies: LearningIndicatorDependency[];
}

export interface IndicatorGraph {
  indicators: Map<string, IndicatorContext>;
  adjacency: Map<string, Set<string>>;
  reverseAdjacency: Map<string, Set<string>>;
}

export const buildIndicatorGraph = (grades: Grade[]): IndicatorGraph => {
  const indicators = new Map<string, IndicatorContext>();
  const adjacency = new Map<string, Set<string>>();
  const reverseAdjacency = new Map<string, Set<string>>();

  grades.forEach(grade => {
    grade.subjects.forEach(subject => {
      subject.competencies.forEach(competency => {
        competency.outcomes.forEach(outcome => {
          outcome.indicators.forEach(indicator => {
            indicators.set(indicator.id, {
              indicator,
              outcome,
              dependencies: []
            });
          });
        });
      });

      subject.indicatorDependencies?.forEach(dep => {
        const prereqSet =
          adjacency.get(dep.sourceIndicatorId) ?? new Set<string>();
        prereqSet.add(dep.targetIndicatorId);
        adjacency.set(dep.sourceIndicatorId, prereqSet);

        const reverse =
          reverseAdjacency.get(dep.targetIndicatorId) ?? new Set<string>();
        reverse.add(dep.sourceIndicatorId);
        reverseAdjacency.set(dep.targetIndicatorId, reverse);

        const target = indicators.get(dep.targetIndicatorId);
        if (target) {
          target.dependencies = [...target.dependencies, dep];
        }
      });
    });
  });

  return { indicators, adjacency, reverseAdjacency };
};

export const findBlockedBy = (
  indicatorId: string,
  graph: IndicatorGraph,
  masteryMap: Map<string, number>,
  threshold = 0.7
): string[] => {
  const upstream = graph.reverseAdjacency.get(indicatorId);
  if (!upstream) {
    return [];
  }
  const blocked: string[] = [];
  upstream.forEach(depId => {
    const mastery = masteryMap.get(depId) ?? 0;
    if (mastery < threshold) {
      blocked.push(depId);
    }
  });
  return blocked;
};

export const topologicalSort = (graph: IndicatorGraph): string[] => {
  const inDegree = new Map<string, number>();
  graph.indicators.forEach((_, id) => {
    inDegree.set(id, graph.reverseAdjacency.get(id)?.size ?? 0);
  });

  const queue: string[] = [];
  inDegree.forEach((count, id) => {
    if (count === 0) {
      queue.push(id);
    }
  });

  const order: string[] = [];
  while (queue.length) {
    const current = queue.shift() as string;
    order.push(current);
    graph.adjacency.get(current)?.forEach(target => {
      const next = (inDegree.get(target) ?? 0) - 1;
      inDegree.set(target, next);
      if (next === 0) {
        queue.push(target);
      }
    });
  }

  return order;
};

export const detectCycles = (graph: IndicatorGraph): string[][] => {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycles: string[][] = [];

  const dfs = (node: string, path: string[]) => {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(node)) {
      return;
    }

    visited.add(node);
    stack.add(node);
    graph.adjacency.get(node)?.forEach(next => {
      dfs(next, [...path, next]);
    });
    stack.delete(node);
  };

  graph.indicators.forEach((_, id) => {
    if (!visited.has(id)) {
      dfs(id, [id]);
    }
  });

  return cycles;
};
