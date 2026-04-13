from __future__ import annotations

import hashlib
import json
import re
import time
from collections import deque
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests

from .raw_page import RawPageRecord

JA_WIKI_API = "https://ja.wikipedia.org/w/api.php"
JA_WIKI_REST_SUMMARY = "https://ja.wikipedia.org/api/rest_v1/page/summary/{title}"

DEFAULT_HEADERS = {
    "User-Agent": "perDistMap/0.1 (https://github.com/local/perDistMap; educational graph research)",
    "Accept-Encoding": "gzip",
}


def normalize_title_key(title: str) -> str:
    t = title.strip().replace("_", " ")
    return t


def title_cache_filename(title: str) -> str:
    key = normalize_title_key(title)
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]
    safe = re.sub(r"[^\w\u3040-\u30ff\u4e00-\u9fff\-]+", "_", key)[:80]
    return f"{safe}_{h}.json"


class JaWikipediaApiClient:
    def __init__(
        self,
        raw_cache_dir: Path,
        sleep_sec: float = 0.08,
        max_retries: int = 4,
    ) -> None:
        self.raw_cache_dir = raw_cache_dir
        self.raw_cache_dir.mkdir(parents=True, exist_ok=True)
        self.sleep_sec = sleep_sec
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)

    def _sleep(self) -> None:
        time.sleep(self.sleep_sec)

    def _get(self, params: dict[str, Any]) -> dict[str, Any]:
        last_err: Exception | None = None
        for attempt in range(self.max_retries):
            self._sleep()
            try:
                r = self.session.get(JA_WIKI_API, params=params, timeout=60)
                if r.status_code == 429:
                    wait = int(r.headers.get("Retry-After", "5"))
                    time.sleep(wait)
                    continue
                r.raise_for_status()
                return r.json()
            except Exception as e:
                last_err = e
                time.sleep(0.5 * (attempt + 1))
        raise RuntimeError(f"API request failed after retries: {last_err}")

    def _cache_path(self, title: str) -> Path:
        return self.raw_cache_dir / title_cache_filename(title)

    def load_cached_record(self, title: str) -> RawPageRecord | None:
        p = self._cache_path(title)
        if not p.exists():
            return None
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            return self._record_from_cache_dict(data)
        except (json.JSONDecodeError, KeyError):
            return None

    def save_record_cache(self, title: str, payload: dict[str, Any]) -> None:
        p = self._cache_path(title)
        p.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def _record_from_cache_dict(self, data: dict[str, Any]) -> RawPageRecord:
        return RawPageRecord(
            page_id=int(data["page_id"]),
            title=data["title"],
            canonical_url=data["canonical_url"],
            categories=list(data.get("categories") or []),
            links=list(data.get("links") or []),
            pageprops=dict(data.get("pageprops") or {}),
            summary=data.get("summary"),
            thumbnail=data.get("thumbnail"),
        )

    def fetch_page_record(self, title: str, use_cache: bool = True) -> RawPageRecord | None:
        if use_cache:
            cached = self.load_cached_record(title)
            if cached is not None:
                return cached

        main = self._fetch_main_props(title)
        if main is None:
            return None

        page_id = main["page_id"]
        resolved_title = main["title"]
        canonical_url = main["url"]
        categories = main["categories"]
        pageprops = main["pageprops"]
        summary = main.get("extract") or ""
        thumbnail = main.get("thumbnail")

        links = self._fetch_all_links(resolved_title)

        payload = {
            "page_id": page_id,
            "title": resolved_title,
            "canonical_url": canonical_url,
            "categories": categories,
            "links": links,
            "pageprops": pageprops,
            "summary": summary[:8000] if summary else None,
            "thumbnail": thumbnail,
        }
        self.save_record_cache(resolved_title, payload)
        return self._record_from_cache_dict(payload)

    def _fetch_main_props(self, title: str) -> dict[str, Any] | None:
        categories: list[str] = []
        pageprops: dict[str, Any] = {}
        extract = ""
        thumbnail: str | None = None
        page_id = -1
        resolved_title = normalize_title_key(title)
        canonical_url = f"https://ja.wikipedia.org/wiki/{quote(resolved_title.replace(' ', '_'))}"

        clcontinue: str | None = None
        for _ in range(200):
            params: dict[str, Any] = {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "redirects": "1",
                "titles": resolved_title,
                "prop": "info|categories|pageprops|extracts|pageimages",
                "inprop": "url",
                "cllimit": "max",
                "exintro": "1",
                "explaintext": "1",
                "piprop": "thumbnail",
                "pithumbsize": "120",
            }
            if clcontinue:
                params["clcontinue"] = clcontinue

            data = self._get(params)
            q = data.get("query", {})
            pages = q.get("pages", [])
            if not pages:
                return None
            p = pages[0]
            if p.get("missing"):
                return None

            page_id = int(p["pageid"])
            resolved_title = p.get("title", resolved_title)
            if "fullurl" in p:
                canonical_url = p["fullurl"]

            for c in p.get("categories", []) or []:
                ct = c.get("title", "")
                if ct.startswith("Category:"):
                    ct = ct[9:]
                if ct and ct not in categories:
                    categories.append(ct)

            for pk, pv in (p.get("pageprops") or {}).items():
                pageprops[pk] = pv

            extract = (p.get("extract") or "") or extract
            th = p.get("thumbnail")
            if isinstance(th, dict) and th.get("source"):
                thumbnail = th["source"]

            clcontinue = q.get("continue", {}).get("clcontinue")
            if not clcontinue:
                break

        return {
            "page_id": page_id,
            "title": resolved_title,
            "url": canonical_url,
            "categories": categories,
            "pageprops": pageprops,
            "extract": extract.strip(),
            "thumbnail": thumbnail,
        }

    def _fetch_all_links(self, title: str) -> list[str]:
        out: list[str] = []
        plcontinue: str | None = None
        for _ in range(500):
            params: dict[str, Any] = {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "redirects": "1",
                "titles": title,
                "prop": "links",
                "plnamespace": "0",
                "pllimit": "max",
            }
            if plcontinue:
                params["plcontinue"] = plcontinue

            data = self._get(params)
            q = data.get("query", {})
            pages = q.get("pages", [])
            if not pages:
                break
            p = pages[0]
            if p.get("missing"):
                break
            for ln in p.get("links", []) or []:
                t = ln.get("title")
                if t:
                    out.append(t)
            cont = data.get("continue") or q.get("continue") or {}
            plcontinue = cont.get("plcontinue")
            if not plcontinue:
                break
        return out


def normalize_category_title(category_title: str) -> str:
    c = category_title.strip().replace("_", " ")
    if not c.startswith("Category:"):
        c = "Category:" + c
    return c


def fetch_category_members(
    category_title: str,
    limit: int,
    sleep_sec: float = 0.08,
) -> list[str]:
    """単一カテゴリの page のみ（後方互換）。再帰探索は fetch_category_tree_page_titles_bfs を使う。"""
    return fetch_category_tree_page_titles_bfs(
        category_title,
        max_depth=0,
        max_pages=limit,
        sleep_sec=sleep_sec,
    )


def fetch_category_tree_page_titles_bfs(
    root_category: str,
    max_depth: int,
    max_pages: int,
    sleep_sec: float = 0.08,
    progress_prefix: str | None = None,
) -> list[str]:
    """
    MediaWiki list=categorymembers, cmtype=subcat|page で BFS。
    - max_depth: ルートを 0 とし、サブカテゴリは深さ +1。深さ max_depth のカテゴリまで列挙。
    - 取得したページタイトルは候補のみ（人物判定は別モジュール）。
    """
    root = normalize_category_title(root_category)
    pages: list[str] = []
    seen_pages: set[str] = set()
    seen_cats: set[str] = set()
    queue: deque[tuple[str, int]] = deque()
    queue.append((root, 0))
    seen_cats.add(root)

    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)

    while queue and len(pages) < max_pages:
        current_cat, depth = queue.popleft()
        cmcontinue: str | None = None
        for _ in range(10000):
            time.sleep(sleep_sec)
            params: dict[str, Any] = {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "list": "categorymembers",
                "cmtitle": current_cat,
                "cmtype": "subcat|page",
                "cmlimit": "max",
            }
            if cmcontinue:
                params["cmcontinue"] = cmcontinue

            r = session.get(JA_WIKI_API, params=params, timeout=60)
            r.raise_for_status()
            data = r.json()
            members = data.get("query", {}).get("categorymembers", [])

            for m in members:
                if len(pages) >= max_pages:
                    break
                ns = m.get("ns")
                title = m.get("title")
                if not title:
                    continue
                if ns == 0:
                    key = normalize_title_key(title)
                    if key not in seen_pages:
                        seen_pages.add(key)
                        pages.append(title)
                        if progress_prefix is not None:
                            from .progress import line as _prog_line

                            _prog_line(
                                f"[シード:{progress_prefix}] "
                                f"{len(pages)}/{max_pages} ページ候補 … {title[:45]}",
                            )
                elif ns == 14 and depth < max_depth:
                    sub = normalize_category_title(title)
                    if sub not in seen_cats:
                        seen_cats.add(sub)
                        queue.append((sub, depth + 1))

            if len(pages) >= max_pages:
                break
            cont = data.get("continue") or {}
            cmcontinue = cont.get("cmcontinue")
            if not cmcontinue:
                break

    if progress_prefix is not None and pages:
        from .progress import done_line as _prog_done

        _prog_done(
            f"[シード:{progress_prefix}] 完了: {len(pages)} 件のページタイトル（候補）",
        )

    return pages[:max_pages]
