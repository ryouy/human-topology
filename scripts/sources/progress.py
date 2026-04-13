"""ターミナルへのリアルタイム進捗（stderr、\\r で同一行更新）。"""

from __future__ import annotations

import sys


def line(msg: str, *, newline: bool = False) -> None:
    """同一行更新（newline=True で改行確定）。"""
    text = (msg[:200] + "…") if len(msg) > 200 else msg
    if newline:
        sys.stderr.write(f"\033[K{text}\n")
    else:
        sys.stderr.write(f"\033[K{text}\r")
    sys.stderr.flush()


def done_line(msg: str) -> None:
    line(msg, newline=True)
