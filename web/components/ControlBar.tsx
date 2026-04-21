"use client";

import type { NodeSizeMode } from "@/types/graph";

export function ControlBar({
  view,
  onViewChange,
  dim,
  onDimChange,
  hops,
  onHopsChange,
  sizeMode,
  onSizeModeChange,
  query,
  onQueryChange,
  searchHits,
  onPickHit,
  showEdges,
  onShowEdgesChange,
  isMobile = false,
}: {
  view: "global" | "ego";
  onViewChange: (v: "global" | "ego") => void;
  dim: "2d" | "3d";
  onDimChange: (d: "2d" | "3d") => void;
  hops: number;
  onHopsChange: (h: number) => void;
  sizeMode: NodeSizeMode;
  onSizeModeChange: (m: NodeSizeMode) => void;
  query: string;
  onQueryChange: (q: string) => void;
  searchHits: { id: string; title: string }[];
  onPickHit: (id: string) => void;
  showEdges: boolean;
  onShowEdgesChange: (v: boolean) => void;
  isMobile?: boolean;
}) {
  return (
    <div className="pointer-events-auto flex flex-wrap items-end gap-3 rounded-lg border border-surface-border bg-surface-raised/90 px-3 py-2 shadow backdrop-blur">
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">
        View
        <select
          value={view}
          onChange={(e) => onViewChange(e.target.value as "global" | "ego")}
          className="rounded border border-surface-border bg-surface px-2 py-1 text-xs text-slate-100"
        >
          <option value="global">Global</option>
          <option value="ego">Ego</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-slate-400">
        Hops
        <select
          value={hops}
          disabled={view !== "ego"}
          onChange={(e) => onHopsChange(Number(e.target.value))}
          title={
            view !== "ego"
              ? "Only applies in ego view (global shows the full graph)"
              : "Neighborhood radius from the center person"
          }
          className="rounded border border-surface-border bg-surface px-2 py-1 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-slate-400">
        Space
        <select
          value={dim}
          onChange={(e) => onDimChange(e.target.value as "2d" | "3d")}
          title={
            isMobile
              ? "Default is 2D; 3D uses more GPU. Orbit: one finger drag."
              : undefined
          }
          className="rounded border border-surface-border bg-surface px-2 py-1 text-xs text-slate-100"
        >
          <option value="2d">2D{isMobile ? " (default)" : ""}</option>
          <option value="3d">3D</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-slate-400">
        Node size
        <select
          value={sizeMode}
          onChange={(e) => onSizeModeChange(e.target.value as NodeSizeMode)}
          className="rounded border border-surface-border bg-surface px-2 py-1 text-xs text-slate-100"
        >
          <option value="inboundLinksCount">In-links</option>
          <option value="degree">degree</option>
          <option value="betweenness">betweenness</option>
        </select>
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
        <input
          type="checkbox"
          checked={showEdges}
          onChange={(e) => onShowEdgesChange(e.target.checked)}
          className="rounded border-surface-border"
        />
        Show edges
      </label>

      <label className="flex min-w-[200px] flex-col gap-1 text-[11px] text-slate-400">
        Search
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Name…"
          className="rounded border border-surface-border bg-surface px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600"
        />
        {searchHits.length > 0 && (
          <ul className="mt-1 max-h-36 overflow-auto rounded border border-surface-border bg-surface text-xs text-slate-200">
            {searchHits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="w-full px-2 py-1 text-left hover:bg-slate-800"
                  onClick={() => onPickHit(h.id)}
                >
                  {h.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </label>
    </div>
  );
}
