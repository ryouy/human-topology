from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from datetime import datetime, timezone
from typing import Any

import networkx as nx


def export_graph_json(
    g: nx.DiGraph,
    node_payloads: dict[str, dict[str, Any]],
    dest: Path,
    graph_type: str = "ja.wikipedia.person_japanese",
    *,
    edge_policy: str | None = None,
    max_one_way_out: int | None = None,
) -> None:
    edges: list[dict[str, Any]] = []
    for u, v in g.edges():
        mutual = bool(g.has_edge(v, u))
        e: dict[str, Any] = {
            "source": str(u),
            "target": str(v),
            "directed": True,
            "mutual": mutual,
        }
        edges.append(e)

    nodes: list[dict[str, Any]] = []
    for n in g.nodes():
        sid = str(n)
        payload = node_payloads.get(sid) or node_payloads.get(str(n))
        if not payload:
            # fallback minimal
            data = g.nodes[n]
            payload = {
                "id": sid,
                "title": data.get("title", sid),
                "url": data.get("url", ""),
                "wikipediaPageId": int(n) if str(n).isdigit() else None,
            }
        nodes.append(payload)

    meta: dict[str, Any] = {
        "graphType": graph_type,
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "distanceMode": "person_only_shortest_path",
    }
    if edge_policy is not None:
        meta["edgePolicy"] = edge_policy
    if max_one_way_out is not None:
        meta["maxOneWayOutPerNode"] = max_one_way_out

    doc = {"nodes": nodes, "edges": edges, "metadata": meta}
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")


def export_node_payloads_from_int_keys(
    payloads_by_int: dict[int, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    return {str(k): v for k, v in payloads_by_int.items()}
