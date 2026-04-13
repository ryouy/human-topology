from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sources.classification import ClassificationResult, classify_record
from sources.raw_page import RawPageRecord
from sources.wikidata_client import fetch_wikidata_hints


def classify_japanese_person_ids(
    records: dict[int, RawPageRecord],
    *,
    wikidata_cache_dir: Path | None = None,
    wikidata_sleep: float = 0.05,
    session: requests.Session | None = None,
    progress: bool = True,
    progress_label: str = "[判定]",
) -> set[int]:
    """person_score と japan_score が両方閾値以上の page_id の集合。"""
    out: set[int] = set()
    sess = session or requests.Session()
    items = list(records.items())
    n = len(items)
    for i, (pid, rec) in enumerate(items):
        wd = fetch_wikidata_hints(
            rec.title,
            session=sess,
            sleep_sec=wikidata_sleep,
            cache_dir=wikidata_cache_dir,
            use_cache=True,
        )
        res = classify_record(rec, wd)
        if res.is_japanese:
            out.add(pid)
        if progress and n:
            from sources.progress import line as prog_line

            prog_line(
                f"{progress_label} {i + 1}/{n} | 日本人: {len(out)} 件 | {rec.title[:40]}",
            )
    if progress and n:
        from sources.progress import done_line

        done_line(f"{progress_label} 完了: {n} 件中 日本人として採用 {len(out)} 件")
    return out


def classify_all(
    records: dict[int, RawPageRecord],
    *,
    wikidata_cache_dir: Path | None = None,
    wikidata_sleep: float = 0.05,
    session: requests.Session | None = None,
    progress: bool = True,
    progress_label: str = "[判定]",
) -> dict[int, ClassificationResult]:
    """全レコードの判定結果（デバッグ・中間ファイル用）。"""
    sess = session or requests.Session()
    results: dict[int, ClassificationResult] = {}
    items = list(records.items())
    n = len(items)
    jp = 0
    person_n = 0
    for i, (pid, rec) in enumerate(items):
        wd = fetch_wikidata_hints(
            rec.title,
            session=sess,
            sleep_sec=wikidata_sleep,
            cache_dir=wikidata_cache_dir,
            use_cache=True,
        )
        res = classify_record(rec, wd)
        results[pid] = res
        if res.is_person:
            person_n += 1
        if res.is_japanese:
            jp += 1
        if progress and n:
            from sources.progress import line as prog_line

            prog_line(
                f"{progress_label} {i + 1}/{n} | 人物: {person_n} 日本人: {jp} | {rec.title[:35]}",
            )
    if progress and n:
        from sources.progress import done_line

        done_line(f"{progress_label} 完了: 全{n}件 | 人物 {person_n} | 日本人 {jp}")
    return results


def export_classifications_json(
    results: dict[int, ClassificationResult],
    records: dict[int, RawPageRecord],
    dest: Path,
) -> None:
    """page_id -> 判定結果とタイトル。"""
    rows: list[dict[str, Any]] = []
    for pid, res in sorted(results.items(), key=lambda x: x[0]):
        rec = records.get(pid)
        row = res.to_dict()
        row["page_id"] = pid
        row["title"] = rec.title if rec else None
        rows.append(row)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
