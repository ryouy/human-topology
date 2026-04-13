#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from build_graph import build_person_digraph
from classify_pages import (
    classify_all,
    classify_japanese_person_ids,
    export_classifications_json,
)
from compute_metrics import attach_metrics_to_nodes
from export_json import export_graph_json, export_node_payloads_from_int_keys
from fetch_pages import (
    _project_root,
    collect_expansion_titles,
    collect_seed_titles,
    fetch_all_records,
    merge_records,
    save_title_manifest,
)


def main() -> None:
    root = _project_root()
    parser = argparse.ArgumentParser(description="Build person-only graph.json from ja.wikipedia API")
    parser.add_argument("--per-category", type=int, default=25, help="各シードカテゴリから取得するページ数の上限")
    parser.add_argument(
        "--category-depth",
        type=int,
        default=2,
        help="カテゴリ BFS の最大深さ（0=当該カテゴリ直下のページのみ）",
    )
    parser.add_argument("--sleep", type=float, default=0.08, help="API sleep between requests")
    parser.add_argument(
        "--export-classifications",
        action="store_true",
        help="data/intermediate/classifications.json に判定理由付きで出力",
    )
    parser.add_argument(
        "--expand-rounds",
        type=int,
        default=3,
        help="人物ページのリンク先を追加取得するラウンド数（0 で無効）",
    )
    parser.add_argument(
        "--expand-budget",
        type=int,
        default=200,
        help="各ラウンドで新規取得する最大ページ数（リンク参照数が多い順）",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=root / "data" / "processed" / "graph.json",
        help="Output graph.json path",
    )
    parser.add_argument(
        "--web-public",
        type=Path,
        default=root / "web" / "public" / "graph.json",
        help="Also copy graph.json to Next.js public/",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="進捗行を表示しない（stderr のリアルタイム表示をオフ）",
    )
    parser.add_argument(
        "--edge-policy",
        choices=["all", "mutual", "mutual_plus_cap"],
        default="mutual_plus_cap",
        help="エッジ間引き: all=全リンク, mutual=相互のみ, mutual_plus_cap=相互+一方通行をノードあたり上限",
    )
    parser.add_argument(
        "--max-one-way-out",
        type=int,
        default=10,
        help="edge-policy=mutual_plus_cap のとき、各ノードの一方通行の出辺の上限（相手の次数が大きい順）",
    )
    args = parser.parse_args()
    progress = not args.quiet

    raw_cache = root / "data" / "raw" / "api_cache"
    wikidata_cache = root / "data" / "raw" / "wikidata_cache"
    seed_json = root / "data" / "raw" / "seed_titles.json"
    manifest_path = root / "data" / "intermediate" / "seed_manifest.json"

    titles = collect_seed_titles(
        per_category_limit=args.per_category,
        category_max_depth=args.category_depth,
        seed_json=seed_json,
        category_sleep_sec=args.sleep,
        progress=progress,
    )
    save_title_manifest(titles, manifest_path)

    if progress:
        from sources.progress import done_line

        done_line(f"[シード] 合計 {len(titles)} タイトル（重複除去後）→ 本文・リンク取得へ")

    records = fetch_all_records(
        titles,
        raw_cache_dir=raw_cache,
        sleep_sec=args.sleep,
        progress=progress,
        progress_label="[取得]",
    )

    expansion_log: list[dict[str, int | str]] = []
    wd_sleep = max(0.03, args.sleep * 0.4)
    if args.expand_rounds > 0 and args.expand_budget > 0:
        for round_i in range(args.expand_rounds):
            if progress:
                from sources.progress import done_line

                done_line(
                    f"[拡張] ラウンド {round_i + 1}/{args.expand_rounds} — 現在 {len(records)} 記事を判定しリンク先を選びます",
                )
            person_ids = classify_japanese_person_ids(
                records,
                wikidata_cache_dir=wikidata_cache,
                wikidata_sleep=wd_sleep,
                progress=progress,
                progress_label=f"[拡張{round_i + 1} 判定]",
            )
            new_titles = collect_expansion_titles(records, person_ids, args.expand_budget)
            if not new_titles:
                expansion_log.append(
                    {"round": round_i + 1, "requested": 0, "new_pages": 0, "note": "no candidates"},
                )
                break
            if progress:
                from sources.progress import done_line

                done_line(
                    f"[拡張] ラウンド {round_i + 1} — 追加取得 {len(new_titles)} タイトル",
                )
            merged = fetch_all_records(
                new_titles,
                raw_cache_dir=raw_cache,
                sleep_sec=args.sleep,
                progress=progress,
                progress_label=f"[拡張{round_i + 1} 取得]",
            )
            added = merge_records(records, merged)
            expansion_log.append(
                {
                    "round": round_i + 1,
                    "requested": len(new_titles),
                    "new_pages": added,
                },
            )
            if added == 0:
                break

    intermediate = {
        "fetched_pages": len(records),
        "seed_titles": len(titles),
        "expansion": expansion_log,
    }
    (root / "data" / "intermediate" / "fetch_stats.json").write_text(
        json.dumps(intermediate, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if progress:
        from sources.progress import done_line

        done_line(f"[最終] 全 {len(records)} 記事を再判定（人物・日本人スコア）します")

    results = classify_all(
        records,
        wikidata_cache_dir=wikidata_cache,
        wikidata_sleep=wd_sleep,
        progress=progress,
        progress_label="[最終判定]",
    )
    person_ids = {pid for pid, r in results.items() if r.is_japanese}
    if args.export_classifications:
        export_classifications_json(
            results,
            records,
            root / "data" / "intermediate" / "classifications.json",
        )
    if not person_ids:
        raise SystemExit(
            "No Japanese person pages classified. Try increasing --per-category or adjusting thresholds in sources/classification.py."
        )

    g = build_person_digraph(
        records,
        person_ids,
        edge_policy=args.edge_policy,
        max_one_way_out=args.max_one_way_out,
    )

    payloads = attach_metrics_to_nodes(g, records, person_ids)
    str_payloads = export_node_payloads_from_int_keys(payloads)

    export_graph_json(
        g,
        str_payloads,
        args.out,
        edge_policy=args.edge_policy,
        max_one_way_out=args.max_one_way_out if args.edge_policy == "mutual_plus_cap" else None,
    )

    if args.web_public:
        args.web_public.parent.mkdir(parents=True, exist_ok=True)
        args.web_public.write_text(args.out.read_text(encoding="utf-8"), encoding="utf-8")

    print(f"Wrote {args.out} (nodes={g.number_of_nodes()} edges={g.number_of_edges()})")
    if args.web_public:
        print(f"Copied to {args.web_public}")


if __name__ == "__main__":
    main()
