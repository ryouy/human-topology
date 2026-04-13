from __future__ import annotations

import math
import random
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import networkx as nx

from sources.raw_page import RawPageRecord


def compute_layout_3d(g: nx.DiGraph, seed: int = 42) -> dict[int, tuple[float, float, float]]:
    """3D spring + 孤立ノードは球面上にばらす（平面に潰れないようにする）。"""
    ug = g.to_undirected()
    n = ug.number_of_nodes()
    if n == 0:
        return {}
    k = 2.5 / math.sqrt(max(n, 1))
    pos = nx.spring_layout(ug, seed=seed, dim=3, iterations=120, k=k)
    rng = random.Random(seed)
    isolates = [node for node in ug.nodes() if ug.degree(node) == 0]
    for node in isolates:
        u, v = rng.random(), rng.random()
        theta = 2 * math.pi * u
        phi = math.acos(2 * v - 1)
        r = 2.0 + rng.random() * 0.75
        pos[node] = (
            r * math.sin(phi) * math.cos(theta),
            r * math.sin(phi) * math.sin(theta),
            r * math.cos(phi),
        )
    out: dict[int, tuple[float, float, float]] = {}
    for node in ug.nodes():
        p = pos[node]
        out[node] = (float(p[0]), float(p[1]), float(p[2]))
    return out


def compute_centralities(g: nx.DiGraph) -> tuple[dict[int, float], dict[int, float]]:
    ug = g.to_undirected()
    if ug.number_of_nodes() == 0:
        return {}, {}
    if ug.number_of_nodes() == 1:
        n = next(iter(ug.nodes()))
        return {n: 0.0}, {n: 0.0}

    bw = nx.betweenness_centrality(ug, normalized=True)
    clo = nx.closeness_centrality(ug)
    return bw, clo


def degree_undirected(g: nx.DiGraph) -> dict[int, int]:
    ug = g.to_undirected()
    return {n: int(ug.degree(n)) for n in g.nodes()}


def inbound_outbound_counts(g: nx.DiGraph) -> tuple[dict[int, int], dict[int, int]]:
    in_c: dict[int, int] = {n: 0 for n in g.nodes()}
    out_c: dict[int, int] = {n: 0 for n in g.nodes()}
    for u, v in g.edges():
        out_c[u] = out_c.get(u, 0) + 1
        in_c[v] = in_c.get(v, 0) + 1
    return in_c, out_c


def attach_metrics_to_nodes(
    g: nx.DiGraph,
    records_by_id: dict[int, RawPageRecord],
    person_ids: set[int],
) -> dict[int, dict[str, Any]]:
    # 2D/3D で同じ座標系を共有（3D レイアウトの x,y と z）
    pos3 = compute_layout_3d(g)
    bw, clo = compute_centralities(g)
    deg_u = degree_undirected(g)
    in_c, out_c = inbound_outbound_counts(g)

    out: dict[int, dict[str, Any]] = {}
    for pid in person_ids:
        if pid not in g:
            continue
        x, y, z = pos3.get(pid, (0.0, 0.0, 0.0))
        rec = records_by_id.get(pid)
        if not rec:
            continue
        out[pid] = {
            "id": str(pid),
            "title": rec.title,
            "url": rec.canonical_url,
            "wikipediaPageId": pid,
            "imageUrl": rec.thumbnail,
            "inboundLinksCount": in_c.get(pid, 0),
            "outboundLinksCount": out_c.get(pid, 0),
            "degree": deg_u.get(pid, 0),
            "betweenness": float(bw.get(pid, 0.0)),
            "closeness": float(clo.get(pid, 0.0)),
            "x": x,
            "y": y,
            "z": z,
        }
    return out
