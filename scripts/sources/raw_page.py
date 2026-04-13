from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RawPageRecord:
    """取得層から共通処理へ渡す正規化レコード（API / ダンプ共通）。"""

    page_id: int
    title: str
    canonical_url: str
    categories: list[str] = field(default_factory=list)
    links: list[str] = field(default_factory=list)
    pageprops: dict[str, Any] = field(default_factory=dict)
    summary: str | None = None
    thumbnail: str | None = None
