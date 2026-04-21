# perDistMap

**Link distance on Wikipedia — visualized.**

A small pipeline builds a person-to-person graph from Japanese Wikipedia biographies, then a Next.js app renders it in **2D / 3D**. Edges follow article wikilinks; distance is shortest path through that graph.

---

## Stack

- Python 3.11+
- Node.js 20+

## Quick start

### 1 · Python env

```bash
cd /path/to/perDistMap
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2 · Build `graph.json`

Pulls seeds from categories and `data/raw/seed_titles.json`, classifies pages, exports `data/processed/graph.json` and `web/public/graph.json`.

**Note:** Edges only exist between pages you actually fetch. The pipeline expands link targets so the graph can grow beyond the initial seed set.

```bash
python scripts/pipeline.py --per-category 25 --category-depth 2 --sleep 0.08 --expand-rounds 3 --expand-budget 200
```

**政治家サブセットに絞る（アプリでよく使う想定）:**

```bash
python scripts/pipeline.py --politicians-only --per-category 25 --category-depth 2 --sleep 0.08 --expand-rounds 3 --expand-budget 200
```

| Flag | Role |
|------|------|
| `--per-category` | Max pages per seed category (BFS via `categorymembers`) |
| `--category-depth` | How deep to walk subcategories (`0` = direct members only) |
| `--sleep` | Delay between API calls (seconds) |
| `--expand-rounds` | Rounds of extra page fetch from out-links (`0` = off) |
| `--expand-budget` | Max new pages per round |
| `--edge-policy` | Default **`mutual_adaptive`** (Louvain + variable cap + jitter + union + rescue). Also: `mutual_union_topk`, `mutual_symmetric_topk`, `mutual_plus_cap`, `mutual`, `all` |
| `--mutual-topk` | Center k for mutual policies (default `28`) |
| `--mutual-cap-spread` | With `mutual_adaptive`, each node’s cap varies in `[topk−spread, topk+spread]` (default `10`) |
| `--max-one-way-out` | Cap on one-way out-edges per node when using `mutual_plus_cap` |
| `--politicians-only` | Seed to Japanese politician categories; graph = JP persons classified as politicians |
| `--export-classifications` | Write `data/intermediate/classifications.json` |

Classification uses Wikipedia + Wikidata signals; caches live under `data/raw/api_cache/` and `data/raw/wikidata_cache/`. First run is slow; repeats reuse cache. Progress logs on stderr — add `--quiet` to trim noise.

### 3 · Web app

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production:

```bash
cd web
npm run build
npm start
```

## Layout

| Path | Purpose |
|------|---------|
| `docs/` | Specs, data notes, plans |
| `scripts/` | Fetch, classify, metrics, export, pipeline |
| `data/raw/` | Seeds, API cache |
| `data/processed/graph.json` | Exported graph |
| `web/` | Next.js UI |

## Behavior

- **Edges:** directed wikilinks between person articles only.
- **Article text:** not embedded in `graph.json`; loaded on demand from the Wikipedia API (in-memory cache).

## Legal

Respect Wikipedia / Wikidata licenses (e.g. CC BY-SA) and [Terms of Use](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use). Mind rate limits when calling APIs.
