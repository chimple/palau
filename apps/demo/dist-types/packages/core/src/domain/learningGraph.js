export const buildIndicatorGraph = (grades) => {
    const indicators = new Map();
    const adjacency = new Map();
    const reverseAdjacency = new Map();
    grades.forEach(grade => {
        grade.subjects.forEach(subject => {
            subject.competencies.forEach(competency => {
                competency.outcomes.forEach(outcome => {
                    outcome.indicators.forEach(indicator => {
                        indicators.set(indicator.id, {
                            indicator,
                            outcome,
                            dependencies: [],
                            competencyId: competency.id,
                            gradeId: grade.id
                        });
                    });
                });
            });
            subject.indicatorDependencies?.forEach(dep => {
                const prereqSet = adjacency.get(dep.sourceIndicatorId) ?? new Set();
                prereqSet.add(dep.targetIndicatorId);
                adjacency.set(dep.sourceIndicatorId, prereqSet);
                const reverse = reverseAdjacency.get(dep.targetIndicatorId) ?? new Set();
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
export const findBlockedBy = (indicatorId, graph, masteryMap, threshold = 0.7) => {
    const upstream = graph.reverseAdjacency.get(indicatorId);
    if (!upstream) {
        return [];
    }
    const blocked = [];
    upstream.forEach(depId => {
        const mastery = masteryMap.get(depId) ?? 0;
        if (mastery < threshold) {
            blocked.push(depId);
        }
    });
    return blocked;
};
export const topologicalSort = (graph) => {
    const inDegree = new Map();
    graph.indicators.forEach((_, id) => {
        inDegree.set(id, graph.reverseAdjacency.get(id)?.size ?? 0);
    });
    const queue = [];
    inDegree.forEach((count, id) => {
        if (count === 0) {
            queue.push(id);
        }
    });
    const order = [];
    while (queue.length) {
        const current = queue.shift();
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
export const detectCycles = (graph) => {
    const visited = new Set();
    const stack = new Set();
    const cycles = [];
    const dfs = (node, path) => {
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
