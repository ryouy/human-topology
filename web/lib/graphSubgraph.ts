import type { GraphData, PersonEdge, PersonNode } from "@/types/graph";

export function buildKHopSubgraph(
  full: GraphData,
  centerId: string,
  maxHops: number,
): GraphData {
  const adj = new Map<string, Set<string>>();
  for (const e of full.edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  const allowed = new Set<string>();
  const q: { id: string; d: number }[] = [{ id: centerId, d: 0 }];
  const seen = new Set<string>();
  while (q.length) {
    const cur = q.shift()!;
    if (seen.has(cur.id)) continue;
    seen.add(cur.id);
    allowed.add(cur.id);
    if (cur.d >= maxHops) continue;
    for (const nb of adj.get(cur.id) || []) {
      if (!seen.has(nb)) q.push({ id: nb, d: cur.d + 1 });
    }
  }

  const nodeById = new Map(full.nodes.map((n) => [n.id, n]));
  const nodes: PersonNode[] = [...allowed]
    .map((id) => nodeById.get(id))
    .filter((n): n is PersonNode => Boolean(n));

  const edges: PersonEdge[] = full.edges.filter(
    (e) => allowed.has(e.source) && allowed.has(e.target),
  );

  return {
    nodes,
    edges,
    metadata: {
      ...full.metadata,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  };
}
