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
  isMobile?: boolean;
}) {
  return (
    <div className="pointer-events-auto flex flex-wrap items-end gap-3 rounded-lg border border-surface-border bg-surface-raised/90 px-3 py-2 shadow backdrop-blur">
      <label className="flex flex-col gap-1 text-[11px] text-slate-400">
        モード
        <select
          value={view}
          onChange={(e) => onViewChange(e.target.value as "global" | "ego")}
          className="rounded border border-surface-border bg-surface px-2 py-1 text-xs text-slate-100"
        >
          <option value="global">全体マップ</option>
          <option value="ego">個人起点</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-slate-400">
        ホップ数
        <select
          value={hops}
          disabled={view !== "ego"}
          onChange={(e) => onHopsChange(Number(e.target.value))}
          title={
            view !== "ego"
              ? "個人起点モードのときだけグラフに反映されます（全体マップでは全ノード表示）"
              : "中心人物からのリンクの段数"
          }
          className="rounded border border-surface-border bg-surface px-2 py-1 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-slate-400">
        表示
        <select
          value={isMobile ? "2d" : dim}
          disabled={isMobile}
          onChange={(e) => onDimChange(e.target.value as "2d" | "3d")}
          title={isMobile ? "スマホでは 3D をオフにしています" : undefined}
          className="rounded border border-surface-border bg-surface px-2 py-1 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <option value="2d">2D{isMobile ? "（推奨）" : ""}</option>
          {!isMobile && <option value="3d">3D</option>}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[11px] text-slate-400">
        ノードサイズ
        <select
          value={sizeMode}
          onChange={(e) => onSizeModeChange(e.target.value as NodeSizeMode)}
          className="rounded border border-surface-border bg-surface px-2 py-1 text-xs text-slate-100"
        >
          <option value="inboundLinksCount">被リンク数</option>
          <option value="degree">degree</option>
          <option value="betweenness">betweenness</option>
        </select>
      </label>

      <label className="flex min-w-[200px] flex-col gap-1 text-[11px] text-slate-400">
        人物検索
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="名前の一部で検索"
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
