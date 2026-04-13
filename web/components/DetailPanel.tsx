"use client";

import type { GraphData } from "@/types/graph";
import { getRelatedPeople } from "@/lib/relatedNeighbors";
import type { DetailState } from "@/hooks/useWikiDetail";
import { useMemo } from "react";

function HeroPhoto({
  node,
  detail,
}: {
  node: { title: string; imageUrl?: string | null };
  detail: DetailState;
}) {
  const src =
    detail.status === "ready" && detail.thumbnail
      ? detail.thumbnail
      : node.imageUrl || null;

  if (!src) {
    return (
      <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-slate-800/80 text-[10px] text-slate-500">
        No photo
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-40 w-40 shrink-0 rounded-lg border border-surface-border object-cover shadow-md"
    />
  );
}

export function DetailPanel({
  detail,
  fullGraph,
  onClose,
  onSetCenter,
  onPickRelated,
}: {
  detail: DetailState;
  fullGraph: GraphData;
  onClose: () => void;
  onSetCenter?: (nodeId: string) => void;
  onPickRelated?: (id: string) => void;
}) {
  const node = detail.status === "idle" ? null : detail.node;
  const related = useMemo(() => {
    if (!node) return [];
    return getRelatedPeople(fullGraph, node.id, 20);
  }, [fullGraph, node?.id]);

  if (detail.status === "idle" || !node) return null;

  return (
    <aside className="absolute right-0 top-0 z-20 flex h-full w-full max-w-md flex-col border-l border-surface-border bg-surface-raised/95 shadow-xl backdrop-blur">
      <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">Profile</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          Close
        </button>
      </div>

      {/* Hero: photo + title + ego CTA — always visible without scrolling */}
      <div className="shrink-0 border-b border-surface-border px-4 pb-4 pt-2">
        <div className="flex gap-4">
          <HeroPhoto node={node} detail={detail} />
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-lg font-semibold leading-snug text-slate-50">{node.title}</p>
            {detail.status === "ready" && (
              <a
                href={detail.articleUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-accent hover:underline"
              >
                Open on Wikipedia
              </a>
            )}
            {detail.status === "error" && (
              <a
                href={detail.articleUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-accent hover:underline"
              >
                Open article
              </a>
            )}
            {detail.status === "loading" && (
              <p className="mt-2 text-xs text-slate-500">Loading summary…</p>
            )}
          </div>
        </div>

        {detail.status !== "loading" && onSetCenter && (
          <button
            type="button"
            onClick={() => onSetCenter(node.id)}
            className="mt-4 w-full rounded-lg border border-accent/40 bg-slate-800/80 px-3 py-2.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
          >
            Use as ego-network center
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">
        {detail.status === "loading" && (
          <div className="space-y-2 text-slate-400">
            <p>Fetching from Wikipedia…</p>
          </div>
        )}

        {detail.status === "error" && (
          <div className="space-y-3">
            <p className="text-amber-300">Could not load summary: {detail.message}</p>
          </div>
        )}

        {detail.status === "ready" && (
          <p className="leading-relaxed text-slate-300">{detail.extract || "No summary."}</p>
        )}

        <MetricsBlock node={node} />

        {related.length > 0 && (
          <div className="mt-6 border-t border-surface-border pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Strong ties (graph neighbors)
            </h3>
            <p className="mb-2 text-[11px] leading-snug text-slate-500">
              Direct links, ranked by edge count and centrality.
            </p>
            <ul className="max-h-52 space-y-1 overflow-y-auto text-xs">
              {related.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onPickRelated?.(r.id)}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-slate-200 hover:bg-slate-800/80"
                  >
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="shrink-0 font-mono text-[10px] text-slate-500">×{r.edgeCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

function MetricsBlock({ node }: { node: { title: string; url: string } & Record<string, unknown> }) {
  const rows: [string, string][] = [
    ["inboundLinksCount", fmt(node.inboundLinksCount)],
    ["outboundLinksCount", fmt(node.outboundLinksCount)],
    ["degree", fmt(node.degree)],
    ["betweenness", fmt(node.betweenness)],
    ["closeness", fmt(node.closeness)],
  ];
  return (
    <div className="mt-6 border-t border-surface-border pt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Metrics (graph.json)
      </h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-right font-mono text-slate-200">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function fmt(v: unknown) {
  if (v === undefined || v === null) return "—";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  return String(v);
}
