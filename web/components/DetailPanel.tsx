"use client";

import type { GraphData } from "@/types/graph";
import { getRelatedPeople } from "@/lib/relatedNeighbors";
import type { DetailState } from "@/hooks/useWikiDetail";
import { useMemo } from "react";

export function DetailPanel({
  detail,
  fullGraph,
  onClose,
  onSetCenter,
  onPickRelated,
}: {
  detail: DetailState;
  /** Full graph (related-neighbor ranking uses this even in ego view) */
  fullGraph: GraphData;
  onClose: () => void;
  /** Set ego-network center (`nodeId` from graph.json) */
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
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">Profile</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 text-sm">
        {detail.status === "loading" && (
          <div className="space-y-3">
            <p className="text-slate-400">Loading from Wikipedia…</p>
            <p className="text-lg font-medium text-slate-100">{node.title}</p>
          </div>
        )}

        {detail.status === "error" && (
          <div className="space-y-3">
            <p className="text-amber-300">Could not load summary: {detail.message}</p>
            <p className="text-lg font-medium text-slate-100">{detail.node.title}</p>
            <a
              href={detail.articleUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              Open article
            </a>
          </div>
        )}

        {detail.status === "ready" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              {detail.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.thumbnail}
                  alt=""
                  className="h-24 w-24 shrink-0 rounded border border-surface-border object-cover"
                />
              )}
              <div>
                <p className="text-lg font-semibold text-slate-50">{detail.node.title}</p>
                <a
                  href={detail.articleUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-sm text-accent hover:underline"
                >
                  Open on Wikipedia
                </a>
              </div>
            </div>
            <p className="leading-relaxed text-slate-300">{detail.extract || "No summary."}</p>
          </div>
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
                    <span className="shrink-0 font-mono text-[10px] text-slate-500">
                      ×{r.edgeCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {detail.status !== "loading" && onSetCenter && (
          <button
            type="button"
            onClick={() => onSetCenter(node.id)}
            className="mt-6 w-full rounded border border-surface-border bg-slate-800/60 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            Use as ego-network center
          </button>
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
