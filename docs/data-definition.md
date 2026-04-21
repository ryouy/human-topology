# データ定義

## 1. graph.json スキーマ

フロントエンドと前処理で共有する TypeScript 風の定義。

### PersonNode

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `id` | string | ✓ | 安定 ID。原則 Wikipedia `pageid` を文字列化 |
| `title` | string | ✓ | 表示用記事タイトル |
| `url` | string | ✓ | 記事の正規 URL |
| `wikipediaPageId` | number | | MediaWiki page id |
| `imageUrl` | string | | 代表サムネイル（任意・軽量なら保持可） |
| `inboundLinksCount` | number | | グラフ内からの被リンク数 |
| `outboundLinksCount` | number | | グラフ内への出リンク数 |
| `degree` | number | | 無向化した次数（in+out の unique 隣接）または有向定義に準拠した値※ |
| `betweenness` | number | | betweenness centrality |
| `closeness` | number | | closeness centrality |
| `x`, `y` | number | | 2D レイアウト座標（前計算または初期乱数） |
| `z` | number | | 3D 用（MVP では force レイアウトでも可） |
| `clusterId` | string \| number | | 将来拡張用（任意） |

※ 本プロジェクトでは `degree` を **無向グラフとしての次数**（同一人物間の双方向リンクは 1 エッジとして数える）として networkx で算出する。

### PersonEdge

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `source` | string | ✓ | 出元ノード `id` |
| `target` | string | ✓ | 先ノード `id` |
| `directed` | literal `true` | ✓ | 常に true（wikilink の向き） |

### GraphMetadata

| フィールド | 型 | 説明 |
|------------|-----|------|
| `graphType` | string | 例: `ja.wikipedia.person_japanese` |
| `nodeCount` | number | |
| `edgeCount` | number | |
| `generatedAt` | string | ISO 8601 |
| `distanceMode` | `"person_only_shortest_path"` | 固定 |
| `edgePolicy` | string | 任意。`all` / `mutual` / `mutual_plus_cap` / `mutual_symmetric_topk` 等 |
| `maxOneWayOutPerNode` | number | `mutual_plus_cap` 時の一方通行の出辺上限 |
| `mutualTopK` | number | 相互系ポリシーの中心 k |
| `mutualCapSpread` | number | `mutual_adaptive` 時の cap の ±幅 |
| `degreeDistribution` | object | 無向次数の mean / stdev / min / max / p50 / p90 / p99（疎密チェック用） |

### エッジ方針（`scripts/build_graph.py`）

人物同士の wikilink だけを見たとき、政治家データセットでは **相互リンクが極端に多く、ほぼ完全グラフに近い**ことがある。そのため可視化・次数のばらつきのため、次のような間引きを選べる。

- **`all`**: 人物→人物の全有向辺（最大密度）。
- **`mutual`**: A→B かつ B→A のペアだけ（相互参照のみ）。
- **`mutual_plus_cap`**: 相互はすべて残し、一方通行はノードあたり上位 `max_one_way_out` 本まで（相手の次数が大きい順）。
- **`mutual_symmetric_topk`**: 相互のみの無向グラフで、各ノードは近傍を **無向次数の昇順**で並べ、上位 `k` 件を候補とする。無向辺 `{u,v}` は **u が v を候補に含み、かつ v が u を候補に含む** ときだけ残す。条件が厳しく **孤立点が非常に増えやすい**。
- **`mutual_union_topk`**: 同じ候補の作り方で、**「v が u の top-k」または「u が v の top-k」** のどちらかで辺を残す（和集合）。その後、まだ次数 0 で相互近傍が存在するノードへ **1 本だけ救済エッジ**を張る。
- **`mutual_adaptive`**（既定）: 相互グラフで **Louvain コミュニティ**を検出し、近傍を **同一コミュニティ優先 → 相手の次数昇順 → 決定的ジッター** で並べる。各ノードの候補数は **`mutualTopK` ± `mutualCapSpread`** で **可変**（固定 k の「全員同じ次数」高原を避ける）。和集合ルール + 救済は `mutual_union_topk` と同じ。

レイアウト用の `x,y,z` は `compute_metrics.py` の spring（無向化グラフ）で付与する。**フロントは graph.json の座標を優先**し、無い場合のみ ID ハッシュ配置にフォールバックする。

### GraphData

```typescript
type GraphData = {
  nodes: PersonNode[];
  edges: PersonEdge[];
  metadata: GraphMetadata;
};
```

## 2. オンデマンド詳細（graph.json 外）

クリック時に API から取得し、フロントのメモリにのみ保持する。

- タイトル
- 要約（extract）
- サムネイル URL
- 記事 URL

## 3. 中間データ（前処理）

### RawPageRecord（取得層 → 共通処理）

取得元が API でもダンプでも、以下に正規化してから classify / build に渡す。

| フィールド | 型 | 説明 |
|------------|-----|------|
| `page_id` | int | |
| `title` | str | 正規化後タイトル |
| `canonical_url` | str | |
| `categories` | list[str] | カテゴリ名（`Category:` プレフィックスは除去してもよい） |
| `links` | list[str] | wikilink 先タイトル（未解決は除外） |
| `pageprops` | dict | 例: `disambiguation` 検出用 |
| `summary` | str \| None | **パイプラインの最終 JSON には含めない**（デバッグ・分類補助のみ） |
| `thumbnail` | str \| None | 任意 |

## 4. シードデータ

- `data/raw/seed_titles.json`: 手動シードタイトル（任意）
- カテゴリ API から取得したタイトル一覧も raw に保存可能
