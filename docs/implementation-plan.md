# 実装計画

## Phase 1: ドキュメント ✓

- `specification.md`, `data-definition.md`, `exclusion-rules.md`, `implementation-plan.md`

## Phase 2: 前処理 MVP（API）

1. **`scripts/sources/`**  
   - `raw_page.py`: `RawPageRecord`  
   - `api_wikipedia.py`: ja.wikipedia REST + Action API、レート制限・リトライ、raw キャッシュ

2. **`scripts/fetch_pages.py`**  
   - シード（カテゴリメンバー + 任意 `seed_titles.json`）  
   - ページメタ・リンク取得、キャッシュ保存

3. **`scripts/classify_pages.py`**  
   - 人物 / 日本人 / 除外

4. **`scripts/build_graph.py`**  
   - 人物同士のリンクのみエッジ化

5. **`scripts/compute_metrics.py`**  
   - inbound/outbound、degree、betweenness、closeness、2D レイアウト座標

6. **`scripts/export_json.py`**  
   - 軽量 `graph.json`、summary なし

7. **`scripts/pipeline.py`**  
   - 上記を順実行、設定（シード上限など）

## Phase 3: 2D フロント MVP

- `web/`: Next.js + TS + Tailwind  
- `public/graph.json` に配置（パイプラインからコピーまたは二重出力）  
- 全体マップ、検索、個人起点（k-hop）、詳細パネル、Wikipedia オンデマンド + キャッシュ

## Phase 4: 3D

- `react-force-graph-3d`、表示モード切替、フォーカス、ホバー

## Phase 5: UI・パフォーマンス

- ローディング / エラー、パネル整理、大規模時の注意（ノード数が多い場合は個人起点推奨）

## Phase 6（将来）: ダンプ

- `scripts/sources/dump_wikipedia.py`（新規）  
- 同じ `RawPageRecord` に変換し、以降は既存 classify 以降を再利用
