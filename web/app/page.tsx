"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { ControlBar } from "@/components/ControlBar";
import { DetailPanel } from "@/components/DetailPanel";
import { useGraphData } from "@/hooks/useGraphData";
import { useIsMobile } from "@/hooks/useIsMobile";

const PersonGraph = dynamic(
  () => import("@/components/PersonGraph").then((m) => m.PersonGraph),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center bg-white text-slate-500">Loading graph…</div> },
);
import { useWikiDetail } from "@/hooks/useWikiDetail";
import { buildKHopSubgraph } from "@/lib/graphSubgraph";
import type { GraphData, NodeSizeMode, PersonNode } from "@/types/graph";

const MOBILE_GRAPH_QUERY = "(max-width: 768px), (max-height: 520px)";

export default function HomePage() {
  const { data, error } = useGraphData();
  const { detail, load, clear } = useWikiDetail();
  const isMobile = useIsMobile();

  const [view, setView] = useState<"global" | "ego">("global");
  const [dim, setDim] = useState<"2d" | "3d">("2d");
  const [hops, setHops] = useState(2);
  const [sizeMode, setSizeMode] = useState<NodeSizeMode>("inboundLinksCount");
  const [centerId, setCenterId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showEdges, setShowEdges] = useState(false);
  /** Strong ties リストから人物を選んだあと、ホバーでカメラ／ビューをそのノードへ向ける */
  const [cameraFollowHover, setCameraFollowHover] = useState(false);
  /** スマホ向け view を適用してからグラフをマウントし、全体マップを一度も描画しない */
  const [graphDisplayReady, setGraphDisplayReady] = useState(false);

  const firstNodeId = data?.nodes[0]?.id ?? null;

  const effectiveCenter = centerId ?? firstNodeId;

  useEffect(() => {
    if (view === "ego" && !centerId && firstNodeId) {
      setCenterId(firstNodeId);
    }
  }, [view, centerId, firstNodeId]);

  useLayoutEffect(() => {
    if (!data) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia(MOBILE_GRAPH_QUERY).matches) {
      setView("ego");
      setHops(1);
      /* dim は useState 既定の 2d のまま（ユーザーが 3D に切り替え可能） */
      const first = data.nodes[0]?.id;
      if (first) setCenterId(first);
    }
    setGraphDisplayReady(true);
  }, [data]);

  const displayGraph: GraphData | null = useMemo(() => {
    if (!data) return null;
    if (view === "global") return data;
    if (!effectiveCenter) return data;
    return buildKHopSubgraph(data, String(effectiveCenter), hops);
  }, [data, view, effectiveCenter, hops]);

  const deferredQuery = useDeferredValue(query);
  const searchHits = useMemo(() => {
    if (!data || !deferredQuery.trim()) return [];
    const q = deferredQuery.trim().toLowerCase();
    return data.nodes
      .filter((n) => n.title.toLowerCase().includes(q))
      .slice(0, 12)
      .map((n) => ({ id: n.id, title: n.title }));
  }, [data, deferredQuery]);

  /** 検索欄に文字があるときの候補ノード（グラフ上で強調） */
  const searchCandidateIds = useMemo(() => {
    if (!query.trim()) return [] as string[];
    return searchHits.map((h) => h.id);
  }, [query, searchHits]);

  /** ヘッダー用（狭い画面は短く、ホバーで全文） */
  const headerMeta = useMemo(() => {
    if (!data) return { short: "", full: "" };
    const m = data.metadata;
    const short = `${m.nodeCount} nodes · ${m.edgeCount} edges${m.politiciansOnly ? " · pol." : ""}`;
    let full = `Japanese Wikipedia · link distance · ${m.nodeCount} nodes · ${m.edgeCount} edges`;
    if (m.politiciansOnly) full += " · politicians subset";
    if (m.edgePolicy) {
      full += ` · edges: ${m.edgePolicy}`;
      if (m.mutualCapSpread != null) full += ` (±${m.mutualCapSpread})`;
    }
    if (m.degreeDistribution) {
      const d = m.degreeDistribution;
      full += ` · deg μ ${d.undirectedDegreeMean.toFixed(1)} σ ${d.undirectedDegreeStdev.toFixed(1)}`;
      if (d.undirectedIsolateCount != null) full += ` · isolates ${d.undirectedIsolateCount}`;
    }
    return { short, full };
  }, [data]);

  const handleNodeClick = useCallback(
    (node: PersonNode) => {
      setFocusId(node.id);
      load(node);
    },
    [load],
  );

  const handlePickHit = useCallback(
    (id: string) => {
      setCameraFollowHover(false);
      setQuery("");
      setFocusId(id);
      const n = data?.nodes.find((x) => x.id === id);
      if (n) load(n);
    },
    [data, load],
  );

  const handleSetCenterFromPanel = useCallback((nodeId: string) => {
    setCameraFollowHover(false);
    setCenterId(nodeId);
    setView("ego");
    setFocusId(nodeId);
  }, []);

  const handlePickRelated = useCallback(
    (id: string) => {
      setCameraFollowHover(true);
      setFocusId(id);
      const n = data?.nodes.find((x) => x.id === id);
      if (n) load(n);
    },
    [data, load],
  );

  const handleGraphNodeClick = useCallback(
    (n: PersonNode) => {
      setCameraFollowHover(false);
      handleNodeClick(n);
      if (view === "ego") {
        setCenterId(n.id);
      }
    },
    [handleNodeClick, view],
  );

  const handleGraphBackgroundClick = useCallback(() => clear(), [clear]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-red-300">{error}</p>
      </main>
    );
  }

  if (!data || !displayGraph) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-slate-400">Loading graph…</p>
      </main>
    );
  }

  return (
    <main className="relative flex h-screen min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-surface-border bg-surface-raised/80 px-2 py-1 backdrop-blur sm:px-3 sm:py-1.5">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-1 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between min-[520px]:gap-2">
          <div className="min-w-0 shrink min-[520px]:max-w-[min(42%,24rem)] lg:max-w-none">
            <h1 className="truncate text-sm font-semibold tracking-tight text-slate-50 sm:text-base">
              Human topology
            </h1>
            <p
              className="truncate text-[10px] leading-tight text-slate-500 sm:text-[11px]"
              title={headerMeta.full}
            >
              <span className="min-[520px]:hidden">{headerMeta.short}</span>
              <span className="hidden min-[520px]:inline">{headerMeta.full}</span>
            </p>
          </div>
          <div className="min-w-0 min-[520px]:flex-1 min-[520px]:flex min-[520px]:justify-end">
            <ControlBar
              view={view}
              onViewChange={setView}
              dim={dim}
              onDimChange={setDim}
              isMobile={isMobile}
              hops={hops}
              onHopsChange={setHops}
              sizeMode={sizeMode}
              onSizeModeChange={setSizeMode}
              query={query}
              onQueryChange={setQuery}
              searchHits={searchHits}
              onPickHit={handlePickHit}
              showEdges={showEdges}
              onShowEdgesChange={setShowEdges}
            />
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-white">
        <div className="absolute inset-0 min-h-0 bg-white touch-none">
          {!graphDisplayReady ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Preparing view…
            </div>
          ) : (
            <PersonGraph
              key={`${view}-${effectiveCenter ?? "none"}-${hops}`}
              data={displayGraph}
              mode={dim}
              sizeMode={sizeMode}
              focusId={focusId}
              cameraFollowHover={cameraFollowHover}
              searchCandidateIds={searchCandidateIds}
              showEdges={showEdges}
              isMobile={isMobile}
              onNodeClick={handleGraphNodeClick}
              onBackgroundClick={handleGraphBackgroundClick}
            />
          )}
        </div>

        {detail.status !== "idle" && (
          <DetailPanel
            detail={detail}
            fullGraph={data}
            onClose={() => clear()}
            onSetCenter={handleSetCenterFromPanel}
            onPickRelated={handlePickRelated}
          />
        )}
      </div>
    </main>
  );
}
