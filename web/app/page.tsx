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
  const [showEdges, setShowEdges] = useState(true);
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
      setDim("2d");
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

  const handleNodeClick = useCallback(
    (node: PersonNode) => {
      setFocusId(node.id);
      load(node);
    },
    [load],
  );

  const handlePickHit = useCallback(
    (id: string) => {
      setQuery("");
      setFocusId(id);
      const n = data?.nodes.find((x) => x.id === id);
      if (n) load(n);
    },
    [data, load],
  );

  const handleSetCenterFromPanel = useCallback((nodeId: string) => {
    setCenterId(nodeId);
    setView("ego");
    setFocusId(nodeId);
  }, []);

  const handlePickRelated = useCallback(
    (id: string) => {
      setFocusId(id);
      const n = data?.nodes.find((x) => x.id === id);
      if (n) load(n);
    },
    [data, load],
  );

  const handleGraphNodeClick = useCallback(
    (n: PersonNode) => {
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
      <header className="shrink-0 border-b border-surface-border bg-surface-raised/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-50">Human topology</h1>
            <p className="text-xs text-slate-500">
              Japanese Wikipedia · link distance · {data.metadata.nodeCount} nodes ·{" "}
              {data.metadata.edgeCount} edges
              {data.metadata.politiciansOnly ? " · politicians subset" : ""}
            </p>
          </div>
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
              mode={isMobile ? "2d" : dim}
              sizeMode={sizeMode}
              focusId={focusId}
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
