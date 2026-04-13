"""
Wikidata Action API から jawiki 記事に紐づくエンティティを取得し、人物・日本国籍のヒントを返す。
キャッシュは data/raw/wikidata_cache/ など呼び出し側で指定。
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests

WIKIDATA_API = "https://www.wikidata.org/w/api.php"

DEFAULT_HEADERS = {
    "User-Agent": "perDistMap/0.1 (https://github.com/local/perDistMap; educational graph research)",
    "Accept-Encoding": "gzip",
}

# https://www.wikidata.org/wiki/Q5
Q_HUMAN = "Q5"
# https://www.wikidata.org/wiki/Q17
Q_JAPAN = "Q17"
# https://www.wikidata.org/wiki/Q82955 （職業: 政治家）
Q_POLITICIAN = "Q82955"


@dataclass
class WikidataHints:
    """分類スコアリング用の Wikidata 由来シグナル。"""

    entity_id: str | None = None
    """instance of (P31) に Q5 が含まれる"""
    instance_of_human: bool = False
    """country of citizenship (P27) 等に Q17 が含まれる"""
    japan_citizenship_or_nationality: bool = False
    """取得できた P31 の Q 番号（デバッグ用）"""
    instance_of_ids: list[str] = field(default_factory=list)
    """職業 (P106) の Q 番号"""
    occupation_ids: list[str] = field(default_factory=list)
    """P106 に政治家 (Q82955) が含まれる"""
    occupation_politician: bool = False
    raw_error: str | None = None


def _cache_path(cache_dir: Path, title: str) -> Path:
    key = title.strip().replace("_", " ")
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()[:28]
    safe = re.sub(r"[^\w\u3040-\u30ff\u4e00-\u9fff\-]+", "_", key)[:60]
    return cache_dir / f"wd_{safe}_{h}.json"


def _extract_statement_entity_ids(claims: dict[str, Any], prop: str) -> list[str]:
    out: list[str] = []
    for stmt in claims.get(prop, []) or []:
        sn = stmt.get("mainsnak") or {}
        dv = sn.get("datavalue") or {}
        if dv.get("type") == "wikibase-entityid":
            vid = (dv.get("value") or {}).get("id")
            if vid:
                out.append(vid)
    return out


def parse_wbgetentities_response(data: dict[str, Any]) -> WikidataHints | None:
    ents = data.get("entities") or {}
    if not ents:
        return None
    for eid, entity in ents.items():
        if str(eid).startswith("-") or entity.get("missing"):
            continue
        return _parse_entity(str(eid), entity)
    return None


def _parse_entity(eid: str, entity: dict[str, Any]) -> WikidataHints | None:
    if entity.get("missing"):
        return WikidataHints(entity_id=None, raw_error="missing")
    claims = entity.get("claims") or {}
    p31 = _extract_statement_entity_ids(claims, "P31")
    p27 = _extract_statement_entity_ids(claims, "P27")
    p106 = _extract_statement_entity_ids(claims, "P106")
    hints = WikidataHints(
        entity_id=eid,
        instance_of_ids=list(p31),
        instance_of_human=Q_HUMAN in p31,
        japan_citizenship_or_nationality=Q_JAPAN in p27,
        occupation_ids=list(p106),
        occupation_politician=Q_POLITICIAN in p106,
    )
    return hints


def fetch_wikidata_hints(
    jawiki_title: str,
    *,
    session: requests.Session | None = None,
    sleep_sec: float = 0.05,
    cache_dir: Path | None = None,
    use_cache: bool = True,
) -> WikidataHints | None:
    """jawiki の記事タイトルから Wikidata ヒントを取得（オプションでディスクキャッシュ）。"""
    title = jawiki_title.strip()
    if cache_dir and use_cache:
        cache_dir.mkdir(parents=True, exist_ok=True)
        p = _cache_path(cache_dir, title)
        if p.exists():
            try:
                raw = json.loads(p.read_text(encoding="utf-8"))
                if raw.get("null"):
                    return None
                return WikidataHints(
                    entity_id=raw.get("entity_id"),
                    instance_of_human=bool(raw.get("instance_of_human")),
                    japan_citizenship_or_nationality=bool(raw.get("japan_citizenship_or_nationality")),
                    instance_of_ids=list(raw.get("instance_of_ids") or []),
                    occupation_ids=list(raw.get("occupation_ids") or []),
                    occupation_politician=bool(raw.get("occupation_politician")),
                    raw_error=raw.get("raw_error"),
                )
            except (json.JSONDecodeError, KeyError):
                pass

    sess = session or requests.Session()
    sess.headers.update(DEFAULT_HEADERS)
    time.sleep(sleep_sec)
    params: dict[str, Any] = {
        "action": "wbgetentities",
        "format": "json",
        "sites": "jawiki",
        "titles": title,
        "languages": "ja",
        "props": "claims",
    }
    try:
        r = sess.get(WIKIDATA_API, params=params, timeout=45)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        hints = WikidataHints(raw_error=str(e))
        _save_cache(cache_dir, title, hints, is_none=False)
        return hints

    hints = parse_wbgetentities_response(data)
    if hints is None:
        if cache_dir:
            p = _cache_path(cache_dir, title)
            p.write_text(json.dumps({"null": True}, ensure_ascii=False), encoding="utf-8")
        return None

    _save_cache(cache_dir, title, hints, is_none=False)
    return hints


def _save_cache(cache_dir: Path | None, title: str, hints: WikidataHints, is_none: bool) -> None:
    if not cache_dir:
        return
    cache_dir.mkdir(parents=True, exist_ok=True)
    p = _cache_path(cache_dir, title)
    if is_none:
        p.write_text(json.dumps({"null": True}, ensure_ascii=False), encoding="utf-8")
        return
    payload = {
        "entity_id": hints.entity_id,
        "instance_of_human": hints.instance_of_human,
        "japan_citizenship_or_nationality": hints.japan_citizenship_or_nationality,
        "instance_of_ids": hints.instance_of_ids,
        "occupation_ids": hints.occupation_ids,
        "occupation_politician": hints.occupation_politician,
        "raw_error": hints.raw_error,
    }
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
