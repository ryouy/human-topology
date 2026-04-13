"""
Phase 2（将来）: Wikimedia ダンプから RawPageRecord を生成する取得層の置き換え用プレースホルダ。

利用テーブル（設計上の想定）:
- page, page_props, redirect, pagelinks, categorylinks

実装時は api_wikipedia.JaWikipediaApiClient と同様に、最終的に RawPageRecord へ正規化して
classify_pages / build_graph 以降をそのまま流用する。
"""

from __future__ import annotations

# from .raw_page import RawPageRecord


class DumpWikipediaSource:
    """未実装: dump パスを追加するときに実装する。"""

    def __init__(self, dump_dir: str) -> None:
        self.dump_dir = dump_dir
