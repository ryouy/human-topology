"""
人物・日本人判定（スコアリング）。閾値・重みは SETTINGS / WEIGHTS で調整可能。
カテゴリは候補補強のみ。Wikidata・pageprops・要約を主に利用。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .raw_page import RawPageRecord
from .wikidata_client import WikidataHints

PERSON_THRESHOLD = 50
JAPAN_THRESHOLD = 50

WEIGHTS: dict[str, int] = {
    "wd_human": 55,
    "wd_not_human": -40,
    "wd_japan_p27": 55,
    "cat_person_block": 22,
    "cat_birth_death": 18,
    "cat_japan_block": 24,
    "summary_person": 16,
    "summary_japan": 18,
}

_PERSON_OCC_KEYS = ("俳優", "声優", "歌手", "政治家", "作家", "学者", "実業家", "作曲家", "漫画家", "スポーツ選手")
_SUMMARY_PERSON_PAT = re.compile(
    r"(政治家|俳優|作家|歌手|学者|実業家|選手|監督|作曲家|漫画家|声優|日本の|日本人|^\s*[^。]{1,40}は)",
)
_SUMMARY_JAPAN_PAT = re.compile(r"(日本人|日本の|日本国|国籍は日本|生まれ[たの])")


@dataclass
class ClassificationResult:
    is_person: bool
    is_japanese: bool
    person_score: int
    japan_score: int
    reasons: list[str] = field(default_factory=list)
    excluded: bool = False
    exclude_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "is_person": self.is_person,
            "is_japanese": self.is_japanese,
            "person_score": self.person_score,
            "japan_score": self.japan_score,
            "reasons": list(self.reasons),
            "excluded": self.excluded,
            "exclude_reason": self.exclude_reason,
        }


def _cat_join(categories: list[str]) -> str:
    return " ".join(categories)


def should_exclude_immediately(record: RawPageRecord) -> tuple[bool, str | None]:
    title = record.title.strip()
    pp = record.pageprops or {}

    if "disambiguation" in pp or "disambiguation" in str(pp).lower():
        return True, "pageprops: disambiguation"

    if "曖昧さ回避" in _cat_join(record.categories):
        return True, "category: 曖昧さ回避"

    if len(title) > 3 and (title.endswith("一覧") or "の一覧" in title):
        return True, "title: 一覧ページ"

    if re.match(r"^\d{1,4}年$", title) or re.match(r"^\d{1,2}月\d{1,2}日$", title):
        return True, "title: 年号/月日ページ"

    return False, None


def _clamp(n: int) -> int:
    return max(0, min(100, n))


def classify_record(record: RawPageRecord, wikidata: WikidataHints | None) -> ClassificationResult:
    reasons: list[str] = []

    ex, why = should_exclude_immediately(record)
    if ex:
        return ClassificationResult(
            is_person=False,
            is_japanese=False,
            person_score=0,
            japan_score=0,
            reasons=[f"除外: {why}"],
            excluded=True,
            exclude_reason=why,
        )

    catj = _cat_join(record.categories)
    sm = (record.summary or "")[:4000]

    ps = 0
    js = 0

    if wikidata and wikidata.entity_id:
        reasons.append(f"Wikidata entity={wikidata.entity_id}")

    if wikidata and wikidata.raw_error and not wikidata.entity_id:
        reasons.append(f"Wikidata注意: {wikidata.raw_error}")

    if wikidata and wikidata.instance_of_human:
        w = WEIGHTS["wd_human"]
        ps += w
        reasons.append(f"+{w} Wikidata P31=人間(Q5)")
    elif wikidata and wikidata.instance_of_ids and not wikidata.instance_of_human:
        w = WEIGHTS["wd_not_human"]
        ps += w
        reasons.append(f"{w} Wikidata P31が人間以外 ({','.join(wikidata.instance_of_ids[:4])})")

    if wikidata and wikidata.japan_citizenship_or_nationality:
        w = WEIGHTS["wd_japan_p27"]
        js += w
        reasons.append(f"+{w} Wikidata P27=日本(Q17)")

    # カテゴリ（人物関連）— ブロック加点（最大1回）
    if "人物" in catj or any(k in catj for k in _PERSON_OCC_KEYS):
        w = WEIGHTS["cat_person_block"]
        ps += w
        reasons.append(f"+{w} カテゴリ（人物・職業系）")
    if any(k in catj for k in ("生年", "没年", "生没年", "出生", "死亡")):
        w = WEIGHTS["cat_birth_death"]
        ps += w
        reasons.append(f"+{w} カテゴリ（生没年等）")

    # カテゴリ（日本関連）
    if "日本人" in catj or "日本の" in catj or re.search(r"日本[人の]", catj):
        w = WEIGHTS["cat_japan_block"]
        js += w
        reasons.append(f"+{w} カテゴリ（日本・日本人）")

    if _SUMMARY_PERSON_PAT.search(sm):
        w = WEIGHTS["summary_person"]
        ps += w
        reasons.append(f"+{w} 要約（人物・記述パターン）")

    if _SUMMARY_JAPAN_PAT.search(sm):
        w = WEIGHTS["summary_japan"]
        js += w
        reasons.append(f"+{w} 要約（日本関連）")

    ps = _clamp(ps)
    js = _clamp(js)

    is_person = ps >= PERSON_THRESHOLD
    is_japanese = is_person and (js >= JAPAN_THRESHOLD)

    reasons.append(
        f"判定: person_score={ps} (>={PERSON_THRESHOLD}?), japan_score={js} (>={JAPAN_THRESHOLD}?) → "
        f"is_person={is_person}, is_japanese={is_japanese}",
    )

    return ClassificationResult(
        is_person=is_person,
        is_japanese=is_japanese,
        person_score=ps,
        japan_score=js,
        reasons=reasons,
        excluded=False,
        exclude_reason=None,
    )
