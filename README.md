# perDistMap

日本語 Wikipedia 上の**日本人人物ページのみ**で構成されたリンクグラフを生成し、人物間の**最短リンク距離（人物ページのみを経由）**を 2D / 3D で可視化するプロジェクトです。

## 前提

- Python 3.11+
- Node.js 20+（推奨）

## セットアップ

### 1. Python（グラフ生成）

```bash
cd /path/to/perDistMap
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. グラフ JSON の生成

Wikipedia API からシードカテゴリ・`data/raw/seed_titles.json` の人物を取得し、`data/processed/graph.json` と `web/public/graph.json` を出力します。

**重要:** シードに含まれるページ同士にしか最初は辺がありません。記事本文から他の人物へリンクが出ていても、その人物ページを**別途取得**していないとノードが孤立し、`degree` や被リンク数がすべて 0 のままになります。パイプラインはデフォルトで **リンク先の追加取得（拡張）** を行い、人物同士の辺が張れるようにします。

```bash
python scripts/pipeline.py --per-category 25 --category-depth 2 --sleep 0.08 --expand-rounds 3 --expand-budget 200
```

- `--per-category`: 各シードカテゴリから取るページ数の上限（`list=categorymembers` + `cmtype=subcat|page` で BFS）
- `--category-depth`: サブカテゴリを辿る最大深さ（`0` = 当該カテゴリ直下のページのみ）
- `--sleep`: リクエスト間隔（秒）
- `--expand-rounds`: リンク先を追加取得するラウンド数（`0` で拡張オフ）
- `--expand-budget`: 各ラウンドで新規取得するページ数の上限（参照が多いリンク先を優先）
- `--edge-policy`: 辺の間引き。`mutual_plus_cap`（既定）= 相互リンクはすべて残し、片方向の出辺はノードあたり上位 `--max-one-way-out` 本まで（相手の次数が高い順）。`mutual` は相互のみ。`all` は間引きなし
- `--max-one-way-out`: `mutual_plus_cap` 時の片方向リンク上限（既定 10）
- `--export-classifications`: `data/intermediate/classifications.json` に `person_score` / `japan_score` と判定理由を出力

**人物判定:** カテゴリは候補取得のみ。ページごとに **Wikipedia（categories, pageprops, extract）** と **Wikidata（P31=人間, P27=日本）** をスコアリングし、`scripts/sources/classification.py` の閾値（既定 50/50）で `is_person` / `is_japanese` を決めます。Wikidata 応答は `data/raw/wikidata_cache/` にキャッシュされます。

初回はキャッシュが無いため時間がかかります。再実行時は `data/raw/api_cache/` と Wikidata キャッシュが使われます。

実行中は **stderr** にリアルタイムで進捗が出ます（カテゴリ候補数、ページ取得 N/M、判定時の「人物・日本人」件数など）。抑えたいときは `--quiet` を付けてください。

### 3. Web アプリ

```bash
cd web
npm install
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

本番ビルド:

```bash
cd web
npm run build
npm start
```

## ディレクトリ

| パス | 内容 |
|------|------|
| `docs/` | 仕様・データ定義・除外ルール・実装計画 |
| `scripts/` | 取得・分類・グラフ・指標・JSON 出力・パイプライン |
| `data/raw/` | シード JSON、API キャッシュ |
| `data/processed/graph.json` | 軽量グラフ（要約は全件含めない） |
| `web/` | Next.js フロント |

## 仕様の要点

- **エッジ**: 人物記事から人物記事への wikilink のみ（有向）
- **詳細テキスト**: `graph.json` には含めず、ノードクリック時に Wikipedia API から取得（メモリキャッシュあり）
- **将来**: 取得層をダンプ版に差し替え可能な設計（`docs/implementation-plan.md`）

## ライセンス・利用注意

Wikipedia のコンテンツはそれぞれのライセンス（通常 CC BY-SA 等）に従ってください。API 利用時は [利用規約](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use) とレート制限に留意してください。
