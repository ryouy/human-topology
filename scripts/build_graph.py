from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

sys.path.insert(0, str(Path(__file__).resolve().parent))

import networkx as nx

from sources.raw_page import RawPageRecord

EdgePolicy = Literal["all", "mutual", "mutual_plus_cap"]


@dataclass(frozen=True)
class BuiltGraph:
    graph: nx.DiGraph
    """ノード: page_id (int)、属性 title, url"""


def build_person_digraph(
    records_by_id: dict[int, RawPageRecord],
    person_ids: set[int],
    *,
    edge_policy: EdgePolicy = "mutual_plus_cap",
    max_one_way_out: int = 10,
) -> nx.DiGraph:
    """
    人物 ID のみをノードとし、リンク先が同一集合に含まれるとき有向辺を張る。

    edge_policy:
      - all: 従来どおり全 wikilink（人物→人物）
      - mutual: 相互リンク（A→B かつ B→A）のみ残す。強い結びつきのみ可視化。
      - mutual_plus_cap: 相互は全て残し、一方通行は各ノードの出辺を上位 max_one_way_out 本まで
        （相手の次数が大きい順＝ハブへのリンクを優先）
    """
    g_full = _build_full_digraph(records_by_id, person_ids)
    if edge_policy == "all":
        return g_full
    if edge_policy == "mutual":
        return _edges_mutual_only(g_full)
    if edge_policy == "mutual_plus_cap":
        return _edges_mutual_plus_capped_oneway(g_full, max_one_way_out=max_one_way_out)
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


def normalize_title(title: str) -> str:
    return title.strip().replace("_", " ")


def graph_edges_for_export(g: nx.DiGraph) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for u, v in g.edges():
        out.append((str(u), str(v)))
    return out
