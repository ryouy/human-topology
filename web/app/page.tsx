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
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center bg-white text-slate-500">グラフを初期化中…</div> },
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
    return buildKHopSubgraph(data, effectiveCenter, hops);
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

  const handleSetCenterFromPanel = useCallback(() => {
    if (detail.status === "loading" || detail.status === "idle") return;
    setCenterId(detail.node.id);
    setView("ego");
    setFocusId(detail.node.id);
  }, [detail]);

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
        <p className="text-slate-400">graph.json を読み込み中…</p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col">
      <header className="border-b border-surface-border bg-surface-raised/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-base font-semibold text-slate-50">perDistMap</h1>
            <p className="text-xs text-slate-500">
              日本語 Wikipedia{" "}
              {data.metadata.politiciansOnly ? "日本人政治家" : "日本人人物"}
              リンク距離（{data.metadata.nodeCount} ノード / {data.metadata.edgeCount} エッジ）
              {isMobile && (
                <span className="mt-1 block text-[10px] text-slate-600">
                  スマホは近傍表示で軽量化しています。「全体マップ」は重い場合があります。
                </span>
              )}
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
          />
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-white">
        <div
          className={`absolute inset-0 bg-white touch-none ${
            isMobile ? "min-h-[min(420px,55vh)] h-[calc(100dvh-160px)]" : "h-[calc(100vh-140px)] min-h-[420px]"
          }`}
        >
          {!graphDisplayReady ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              グラフを表示準備中…
            </div>
          ) : (
            <PersonGraph
              data={displayGraph}
              mode={isMobile ? "2d" : dim}
              sizeMode={sizeMode}
              focusId={focusId}
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
