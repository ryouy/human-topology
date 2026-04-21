"use client";

import type { NodeSizeMode } from "@/types/graph";

const GITHUB_REPO = "https://github.com/ryouy/human-topology";

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
  const sel =
    "rounded border border-surface-border bg-surface px-1.5 py-0.5 text-[11px] text-slate-100 leading-tight";
  const lab = "text-[10px] leading-none text-slate-500";

  return (
    <div className="pointer-events-auto flex flex-wrap items-end gap-x-2 gap-y-1">
      <label className={`flex flex-col gap-0.5 ${lab}`}>
        View
        <select value={view} onChange={(e) => onViewChange(e.target.value as "global" | "ego")} className={sel}>
          <option value="global">Global</option>
          <option value="ego">Ego</option>
        </select>
      </label>

      <label className={`flex flex-col gap-0.5 ${lab}`}>
        Hops
        <select
          value={hops}
          disabled={view !== "ego"}
          onChange={(e) => onHopsChange(Number(e.target.value))}
          title={view !== "ego" ? "Ego view only" : "Neighborhood radius"}
          className={`${sel} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>

      <label className={`flex flex-col gap-0.5 ${lab}`}>
        Space
        <select
          value={dim}
          onChange={(e) => onDimChange(e.target.value as "2d" | "3d")}
          title={isMobile ? "2D default; 3D uses more GPU" : undefined}
          className={sel}
        >
          <option value="2d">2D{isMobile ? " · def" : ""}</option>
          <option value="3d">3D</option>
        </select>
      </label>

      <label className={`flex flex-col gap-0.5 ${lab}`}>
        Size
        <select
          value={sizeMode}
          onChange={(e) => onSizeModeChange(e.target.value as NodeSizeMode)}
          className={sel}
        >
          <option value="inboundLinksCount">In</option>
          <option value="degree">deg</option>
          <option value="betweenness">betw.</option>
        </select>
      </label>

      <label className={`flex cursor-pointer items-center gap-1 self-end pb-0.5 ${lab} text-slate-400`}>
        <input
          type="checkbox"
          checked={showEdges}
          onChange={(e) => onShowEdgesChange(e.target.checked)}
          className="rounded border-surface-border"
        />
        Edges
      </label>

      <label className={`relative flex min-w-0 max-w-[11rem] flex-1 flex-col gap-0.5 sm:max-w-[13rem] ${lab}`}>
        Search
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Name…"
          className={`${sel} w-full min-w-0`}
        />
        {searchHits.length > 0 && (
          <ul className="absolute left-0 top-full z-50 mt-0.5 max-h-32 w-full min-w-[10rem] overflow-auto rounded border border-surface-border bg-surface text-[11px] text-slate-200 shadow-lg">
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

      <a
        href={GITHUB_REPO}
        target="_blank"
        rel="noreferrer"
        className="mb-0.5 ml-0.5 shrink-0 border-l border-slate-600/80 pl-2 text-[10px] text-slate-500 hover:text-slate-300 hover:underline sm:pl-2.5"
      >
        GitHub
      </a>
    </div>
  );
}
