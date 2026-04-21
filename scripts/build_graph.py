from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

sys.path.insert(0, str(Path(__file__).resolve().parent))

import networkx as nx

from sources.raw_page import RawPageRecord

EdgePolicy = Literal[
    "all",
    "mutual",
    "mutual_plus_cap",
    "mutual_symmetric_topk",
    "mutual_union_topk",
    "mutual_adaptive",
]


@dataclass(frozen=True)
class BuiltGraph:
    graph: nx.DiGraph
    """ノード: page_id (int)、属性 title, url"""


def build_person_digraph(
    records_by_id: dict[int, RawPageRecord],
    person_ids: set[int],
    *,
    edge_policy: EdgePolicy = "mutual_adaptive",
    max_one_way_out: int = 10,
    mutual_topk: int = 28,
    mutual_cap_spread: int = 10,
) -> nx.DiGraph:
    """
    人物 ID のみをノードとし、リンク先が同一集合に含まれるとき有向辺を張る。

    edge_policy:
      - all: 従来どおり全 wikilink（人物→人物）
      - mutual: 相互リンク（A→B かつ B→A）のみ残す。強い結びつきのみ可視化。
      - mutual_plus_cap: 相互は全て残し、一方通行は各ノードの出辺を上位 max_one_way_out 本まで
        （相手の次数が大きい順＝ハブへのリンクを優先）
      - mutual_symmetric_topk: 相互のみを間引き、両者の top-k 候補に**互いに**入るペアだけ。
        疎になるが孤立点が非常に増えやすい。
      - mutual_union_topk: 相互のみを間引き、u→v について「v が u の top-k」**または**
        「u が v の top-k」なら残す。その後、次数 0 は相互グラフで次数最小の近傍へ 1 本救済。
      - mutual_adaptive（既定）: 相互グラフで Louvain コミュニティを取り、近傍を
        「同一コミュニティ優先 → 相手の次数昇順 → 決定的ジッター」で並べ、ノードごとに
        mutual_topk ± mutual_cap_spread の可変 cap で候補を切る。和集合ルール + 救済は union と同じ。
    """
    g_full = _build_full_digraph(records_by_id, person_ids)
    if edge_policy == "all":
        return g_full
    if edge_policy == "mutual":
        return _edges_mutual_only(g_full)
    if edge_policy == "mutual_plus_cap":
        return _edges_mutual_plus_capped_oneway(g_full, max_one_way_out=max_one_way_out)
    if edge_policy == "mutual_symmetric_topk":
        return _edges_mutual_symmetric_topk(g_full, k=mutual_topk)
    if edge_policy == "mutual_union_topk":
        return _edges_mutual_union_topk(g_full, k=mutual_topk)
    if edge_policy == "mutual_adaptive":
        return _edges_mutual_adaptive(
            g_full,
            k_center=mutual_topk,
            cap_spread=mutual_cap_spread,
        )
    raise ValueError(f"unknown edge_policy: {edge_policy}")


def _build_full_digraph(
    records_by_id: dict[int, RawPageRecord],
    person_ids: set[int],
) -> nx.DiGraph:
    g = nx.DiGraph()
    id_to_title = {pid: rec.title for pid, rec in records_by_id.items() if pid in person_ids}
    title_to_id = {normalize_title(t): i for i, t in id_to_title.items()}

    for pid in person_ids:
        rec = records_by_id.get(pid)
        if not rec:
            continue
        g.add_node(pid, title=rec.title, url=rec.canonical_url, wikipediaPageId=pid)

    for pid in person_ids:
        rec = records_by_id.get(pid)
        if not rec:
            continue
        for lt in rec.links:
            tid = title_to_id.get(normalize_title(lt))
            if tid is not None and tid != pid:
                g.add_edge(pid, tid)

    return g


def _edges_mutual_only(g: nx.DiGraph) -> nx.DiGraph:
    """両方向のリンクが存在するペアのみ残す（有向2本）。"""
    g2 = nx.DiGraph()
    g2.add_nodes_from(g.nodes(data=True))
    for u, v in g.edges():
        if u == v:
            continue
        if g.has_edge(v, u):
            g2.add_edge(u, v)
    return g2


def _edges_mutual_plus_capped_oneway(g: nx.DiGraph, max_one_way_out: int) -> nx.DiGraph:
    """
    相互リンクはすべて採用。
    一方通行は各ノード u について、出辺のうち「相手からの逆リンクがない」ものだけを対象に、
    相手ノードの次数（無向）が大きい順に max_one_way_out 本まで。
    """
    g2 = nx.DiGraph()
    g2.add_nodes_from(g.nodes(data=True))

    ug = g.to_undirected()

    for u, v in g.edges():
        if g.has_edge(v, u):
            g2.add_edge(u, v)

    for u in g.nodes():
        candidates: list[tuple[int, int]] = []
        for v in g.successors(u):
            if g.has_edge(v, u):
                continue
            if g2.has_edge(u, v):
                continue
            deg = ug.degree(v)
            candidates.append((deg, v))
        candidates.sort(key=lambda x: -x[0])
        for _, v in candidates[:max_one_way_out]:
            g2.add_edge(u, v)

    return g2


def _edges_mutual_symmetric_topk(g_full: nx.DiGraph, k: int) -> nx.DiGraph:
    """
    相互リンクのみの無向グラフで、各ノード u は近傍を「無向次数の昇順」で並べ、
    上位 k 件を候補とする。無向辺 {u,v} は、u が v を候補に含み、かつ v が u を候補に含む
    ときだけ残す（対称 top-k）。有向は元グラフに存在する向きで両方張る。
    """
    k = max(1, int(k))
    ug = nx.Graph()
    for u, v in g_full.edges():
        if u == v:
            continue
        if g_full.has_edge(v, u):
            ug.add_edge(u, v)

    g2 = nx.DiGraph()
    g2.add_nodes_from(g_full.nodes(data=True))
    if ug.number_of_edges() == 0:
        return g2

    keep_pairs: set[tuple[int, int]] = set()
    for u in ug.nodes():
        nbrs = list(ug.neighbors(u))
        nbrs.sort(key=lambda v: (ug.degree(v), v))
        top_k_u = set(nbrs[:k])
        for v in nbrs[:k]:
            nbrs_v = list(ug.neighbors(v))
            nbrs_v.sort(key=lambda w: (ug.degree(w), w))
            top_k_v = set(nbrs_v[:k])
            if u in top_k_v and v in top_k_u:
                a, b = (u, v) if u < v else (v, u)
                keep_pairs.add((a, b))

    for u, v in keep_pairs:
        if g_full.has_edge(u, v):
            g2.add_edge(u, v)
        if g_full.has_edge(v, u):
            g2.add_edge(v, u)
    return g2


def _edges_mutual_union_topk(g_full: nx.DiGraph, k: int) -> nx.DiGraph:
    """
    相互グラフ ug の各辺 {u,v} について、v が u の top-k 近傍に入る **か**
    u が v の top-k 近傍に入るなら採用（和集合）。対称 top-k より疎結合が減る。
    その後、相互近傍がまだ 1 人もいないノードへ、ug 上で次数最小の近傍へ 1 本救済。
    """
    k = max(1, int(k))
    ug = nx.Graph()
    for u, v in g_full.edges():
        if u == v:
            continue
        if g_full.has_edge(v, u):
            ug.add_edge(u, v)

    g2 = nx.DiGraph()
    g2.add_nodes_from(g_full.nodes(data=True))
    if ug.number_of_edges() == 0:
        return g2

    def top_k_neighbors(u: int) -> set[int]:
        nbrs = list(ug.neighbors(u))
        nbrs.sort(key=lambda v: (ug.degree(v), v))
        return set(nbrs[:k])

    keep_pairs: set[tuple[int, int]] = set()
    for u, v in ug.edges():
        a, b = (u, v) if u < v else (v, u)
        tu = top_k_neighbors(u)
        tv = top_k_neighbors(v)
        if v in tu or u in tv:
            keep_pairs.add((a, b))

    for u, v in keep_pairs:
        if g_full.has_edge(u, v):
            g2.add_edge(u, v)
        if g_full.has_edge(v, u):
            g2.add_edge(v, u)

    _rescue_isolated_mutual_neighbors(g_full, ug, g2)
    return g2


def _jitter01(u: int, v: int) -> float:
    """決定的な [0,1) ジッター（確率的間引きの代わりに順位をばらす）。"""
    x = (u * 3_125 + v * 789 + 0x9E3779B9) & 0xFFFFFFFF
    return x / 0x1_0000_0000


def _community_labels(ug: nx.Graph) -> dict[int, int]:
    """Louvain（失敗時は greedy modularity）。ノード id → コミュニティ番号。"""
    if ug.number_of_edges() == 0:
        return {}
    try:
        sets = nx.community.louvain_communities(ug, seed=42, resolution=1.0)
    except Exception:
        try:
            sets = nx.community.greedy_modularity_communities(ug)
        except Exception:
            return {n: 0 for n in ug.nodes()}
    return {n: i for i, c in enumerate(sets) for n in c}


def _mutual_cap_for_node(u: int, center: int, spread: int) -> int:
    """ノードごとに cap をずらし、全員 k 固定の高原を避ける（決定的）。"""
    center = max(8, int(center))
    spread = max(0, int(spread))
    h = (u * 1_103_515_245 + 12_345) & 0x7FFFFFFF
    delta = (h % (2 * spread + 1)) - spread if spread else 0
    return max(6, min(64, center + delta))


def _edges_mutual_adaptive(
    g_full: nx.DiGraph,
    *,
    k_center: int,
    cap_spread: int,
) -> nx.DiGraph:
    """
    相互グラフ上でコミュニティ検出 → 同一コミュニティの近傍を優先し、
    次数昇順 + ジッターで並べ、ノードごとの可変 cap で候補を切ってから和集合ルール。
    """
    ug = nx.Graph()
    for u, v in g_full.edges():
        if u == v:
            continue
        if g_full.has_edge(v, u):
            ug.add_edge(u, v)

    g2 = nx.DiGraph()
    g2.add_nodes_from(g_full.nodes(data=True))
    if ug.number_of_edges() == 0:
        return g2

    comm = _community_labels(ug)

    def selected_neighbors(u: int) -> set[int]:
        nbrs = list(ug.neighbors(u))
        cu = comm.get(u, -1)
        nbrs.sort(
            key=lambda v: (
                0 if comm.get(v, -1) == cu else 1,
                ug.degree(v),
                v,
                _jitter01(u, v),
            ),
        )
        cap = _mutual_cap_for_node(u, k_center, cap_spread)
        return set(nbrs[:cap])

    keep_pairs: set[tuple[int, int]] = set()
    for u, v in ug.edges():
        a, b = (u, v) if u < v else (v, u)
        su = selected_neighbors(u)
        sv = selected_neighbors(v)
        if v in su or u in sv:
            keep_pairs.add((a, b))

    for u, v in keep_pairs:
        if g_full.has_edge(u, v):
            g2.add_edge(u, v)
        if g_full.has_edge(v, u):
            g2.add_edge(v, u)

    _rescue_isolated_mutual_neighbors(g_full, ug, g2)
    return g2


def _rescue_isolated_mutual_neighbors(g_full: nx.DiGraph, ug: nx.Graph, g2: nx.DiGraph) -> None:
    """無向次数 0 かつ ug 上に近傍がいるノードへ、次数最小の近傍へ 1 本だけ張る。"""
    for u in list(g2.nodes()):
        if g2.degree(u) > 0:
            continue
        # g2 は全人物、ug は「相互リンクが 1 本でもあるノード」だけ。相互ゼロの人物は ug に含まれない。
        if u not in ug:
            continue
        nbrs = list(ug.neighbors(u))
        if not nbrs:
            continue
        nbrs.sort(key=lambda v: (ug.degree(v), v))
        v = nbrs[0]
        if g_full.has_edge(u, v):
            g2.add_edge(u, v)
        if g_full.has_edge(v, u):
            g2.add_edge(v, u)


def normalize_title(title: str) -> str:
    return title.strip().replace("_", " ")


def graph_edges_for_export(g: nx.DiGraph) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for u, v in g.edges():
        out.append((str(u), str(v)))
    return out
