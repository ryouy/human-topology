import type { GraphData, PersonNode } from "@/types/graph";

export type RelatedPerson = {
  id: string;
  title: string;
  score: number;
  /** この人物とグラフ上で直接つながっている本数（無向） */
  edgeCount: number;
};

/**
 * 同一グラフ内で 1 ホップ隣接する人物を「関連が深い」順に並べる。
 * スコア: 共通エッジ数 + 隣接ノードの degree/betweenness（ハブを上に）
 */
export function getRelatedPeople(
  full: GraphData,
  nodeId: string,
  limit = 24,
): RelatedPerson[] {
  const byId = new Map(full.nodes.map((n) => [n.id, n]));
  const neighborCount = new Map<string, number>();

  for (const e of full.edges) {
    if (e.source === nodeId) {
      neighborCount.set(e.target, (neighborCount.get(e.target) ?? 0) + 1);
    }
    if (e.target === nodeId) {
      neighborCount.set(e.source, (neighborCount.get(e.source) ?? 0) + 1);
    }
  }

  const out: RelatedPerson[] = [];
  for (const [nid, ec] of neighborCount) {
    const n = byId.get(nid);
    if (!n) continue;
    const deg = n.degree ?? 0;
    const bw = n.betweenness ?? 0;
    const score = ec * 8 + deg * 1.2 + bw * 40;
    out.push({ id: nid, title: n.title, score, edgeCount: ec });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
