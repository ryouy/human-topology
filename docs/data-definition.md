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
