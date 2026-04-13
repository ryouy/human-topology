from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import requests
from urllib.parse import quote

from sources.api_wikipedia import (
    JaWikipediaApiClient,
    fetch_category_tree_page_titles_bfs,
    normalize_title_key,
)
from sources.raw_page import RawPageRecord

DEFAULT_SEED_CATEGORIES = [
    "日本の政治家",
    "日本の俳優",
    "日本の作家",
    "日本の実業家",
    "日本の学者",
    "日本のスポーツ選手",
]


def _project_root() -> Path:
    return SCRIPT_DIR.parent


def fetch_page_summary(title: str) -> dict[str, Any]:
    """REST API: 要約・サムネイル等（フロントのオンデマンド取得用にも利用可能）。"""
    t = normalize_title_key(title).replace(" ", "_")
    url = f"https://ja.wikipedia.org/api/rest_v1/page/summary/{quote(t, safe='')}"
    r = requests.get(
        url,
        headers={"User-Agent": "perDistMap/0.1 (educational)"},
        timeout=30,
    )
    if r.status_code != 200:
        return {"error": r.status_code, "title": title}
    return r.json()


def fetch_page_metadata(title: str, client: JaWikipediaApiClient) -> dict[str, Any] | None:
    rec = client.fetch_page_record(title, use_cache=True)
    if not rec:
        return None
    return {
        "page_id": rec.page_id,
        "title": rec.title,
        "url": rec.canonical_url,
        "categories": rec.categories,
        "pageprops": rec.pageprops,
    }


def fetch_page_categories(title: str, client: JaWikipediaApiClient) -> list[str]:
    rec = client.fetch_page_record(title, use_cache=True)
    return list(rec.categories) if rec else []


def fetch_page_links(title: str, client: JaWikipediaApiClient) -> list[str]:
    rec = client.fetch_page_record(title, use_cache=True)
    return list(rec.links) if rec else []


def fetch_pageprops(title: str, client: JaWikipediaApiClient) -> dict[str, Any]:
    rec = client.fetch_page_record(title, use_cache=True)
    return dict(rec.pageprops) if rec else {}


def load_seed_titles_json(path: Path) -> list[str]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    raw = data.get("titles") or []
    return [normalize_title_key(str(t)) for t in raw if str(t).strip()]


def collect_seed_titles(
    per_category_limit: int,
    category_max_depth: int = 2,
    seed_json: Path | None = None,
    category_sleep_sec: float = 0.08,
    progress: bool = True,
) -> list[str]:
    titles: list[str] = []
    if seed_json and seed_json.exists():
        titles.extend(load_seed_titles_json(seed_json))

    for cat in DEFAULT_SEED_CATEGORIES:
        try:
            if progress:
                from sources.progress import done_line

                done_line(
                    f"[シード] カテゴリ「{cat}」探索開始 depth≤{category_max_depth} 上限{per_category_limit}件",
                )
            batch = fetch_category_tree_page_titles_bfs(
                cat,
                max_depth=category_max_depth,
                max_pages=per_category_limit,
                sleep_sec=category_sleep_sec,
                progress_prefix=cat if progress else None,
            )
            titles.extend(batch)
        except Exception:
            continue

    # 重複除去（順序維持）
    seen: set[str] = set()
    out: list[str] = []
    for t in titles:
        k = normalize_title_key(t)
        if k not in seen:
            seen.add(k)
            out.append(k)
    return out


def fetch_all_records(
    titles: list[str],
    raw_cache_dir: Path,
    sleep_sec: float = 0.08,
    progress: bool = True,
    progress_label: str = "[取得]",
) -> dict[int, RawPageRecord]:
    client = JaWikipediaApiClient(raw_cache_dir=raw_cache_dir, sleep_sec=sleep_sec)
    by_id: dict[int, RawPageRecord] = {}
    total = len(titles)
    for i, title in enumerate(titles):
        if progress and total:
            from sources.progress import line as prog_line

            prog_line(
                f"{progress_label} {i + 1}/{total} ページ取得中 … {title[:50]}",
            )
        try:
            rec = client.fetch_page_record(title, use_cache=True)
            if rec:
                by_id[rec.page_id] = rec
        except Exception:
            continue
    if progress:
        from sources.progress import done_line

        done_line(
            f"{progress_label} 完了: ユニーク記事 {len(by_id)} 件（タイトル列 {total} 件）",
        )
    return by_id


def save_title_manifest(titles: list[str], dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        json.dumps({"titles": titles, "count": len(titles)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _should_skip_expansion_title(title: str) -> bool:
    """拡張取得の候補から除外（一覧・年号などはリンクが多いが人物ではない）。"""
    t = title.strip()
    if len(t) < 2 or len(t) > 120:
        return True
    if any(x in t for x in ("一覧", "曖昧さ回避", "ウィキプロジェクト", "の一覧")):
        return True
    if re.match(r"^\d{1,4}年$", t) or re.match(r"^\d{1,2}月\d{1,2}日$", t):
        return True
    return False


def collect_expansion_titles(
    records: dict[int, RawPageRecord],
    person_ids: set[int],
    budget: int,
) -> list[str]:
    """
    既に取得済みの人物ページから出ているリンクのうち、まだ取得していないタイトルを返す。
    複数人物からリンクされるタイトル（ハブになりやすい）を優先する。
    """
    known = {normalize_title_key(r.title) for r in records.values()}
    count: dict[str, int] = defaultdict(int)
    repr_title: dict[str, str] = {}

    for pid in person_ids:
        rec = records.get(pid)
        if not rec:
            continue
        for lt in rec.links:
            if _should_skip_expansion_title(lt):
                continue
            k = normalize_title_key(lt)
            if k in known:
                continue
            count[k] += 1
            if k not in repr_title:
                repr_title[k] = lt.strip()

    ordered = sorted(count.keys(), key=lambda x: (-count[x], x))
    out: list[str] = []
    for k in ordered:
        if len(out) >= budget:
            break
        out.append(repr_title[k])
    return out


def merge_records(
    base: dict[int, RawPageRecord],
    extra: dict[int, RawPageRecord],
) -> int:
    """base に extra をマージし、新規 page_id 数を返す。"""
    before = len(base)
    base.update(extra)
    return len(base) - before
