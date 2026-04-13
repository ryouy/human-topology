"use client";

import { forceCollide, type SimulationNodeDatum } from "d3-force";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import ForceGraph2D, {
  type ForceGraphMethods as FG2Methods,
  type GraphData as FG2GraphData,
} from "react-force-graph-2d";
import ForceGraph3D, {
  type ForceGraphMethods as FG3Methods,
  type GraphData as FG3GraphData,
} from "react-force-graph-3d";
import type { GraphData, NodeSizeMode, PersonNode } from "@/types/graph";

/** 初期配置の立方体の半辺（[-BOX, BOX] にランダム）— 広めに取り単一塊への収束を抑える */
const BOX_HALF = 720;
/** 追加ジッター（規則格子・六角詰めを崩す） */
const JITTER = 220;

function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

/**
 * 球殻ではなく「箱内一様 + 大きめジッター」。
 * forceCollide による六角密充填を避けるため、対称性の高い配置は使わない。
 */
function initialXYZ(id: string, dim3: boolean): { x: number; y: number; z?: number } {
  const jx = (hash01(`${id}:jx`) - 0.5) * 2 * JITTER;
  const jy = (hash01(`${id}:jy`) - 0.5) * 2 * JITTER;
  const x = (hash01(`${id}:x`) - 0.5) * 2 * BOX_HALF + jx;
  const y = (hash01(`${id}:y`) - 0.5) * 2 * BOX_HALF + jy;
  if (!dim3) return { x, y };
  const jz = (hash01(`${id}:jz`) - 0.5) * 2 * JITTER;
  const z = (hash01(`${id}:z`) - 0.5) * 2 * BOX_HALF + jz;
  return { x, y, z };
}

function sizeFor(node: PersonNode, mode: NodeSizeMode): number {
  let raw: number;
  if (mode === "betweenness") raw = 1 + (node.betweenness ?? 0) * 48;
  else if (mode === "degree") raw = 1 + (node.degree ?? 0) * 0.85;
  else raw = 1 + (node.inboundLinksCount ?? 0) * 0.45;
  return Math.min(22, Math.max(2, raw));
}

function applyForces(fg: FG2Methods | FG3Methods | undefined, nodeCount: number) {
  if (!fg || typeof fg.d3Force !== "function") return;

  fg.d3Force("center", null);

  const n = Math.max(1, nodeCount);
  // 大規模時は衝突の強さを少し下げて収束を速くし、シミュレーション負荷を抑える
  const collisionStrength = n > 4500 ? 0.78 : n > 2000 ? 0.86 : 0.94;

  // ノード重なりによる「太陽」塊を避ける（半径は描画サイズに合わせる）
  fg.d3Force(
    "collision",
    forceCollide<SimulationNodeDatum & { __size?: number }>()
      .radius((d) => Math.max(5, (d.__size ?? 5) * 0.52 + 3))
      .strength(collisionStrength),
  );

  const charge = fg.d3Force("charge") as { strength?: (n: number | (() => number)) => unknown } | undefined;
  if (charge) {
    // 大規模グラフほど強い反発（上限付き）
    const strength = -Math.min(5200, 420 + Math.sqrt(n) * 38);
    charge.strength?.(strength);
  }

  const link = fg.d3Force("link") as {
    distance?: (d: number | ((e: unknown) => number)) => unknown;
    strength?: (s: number | ((e: unknown) => number)) => unknown;
  } | undefined;
  if (link) {
    const dist = Math.min(340, Math.max(175, 95 + Math.sqrt(n) * 2.4));
    link.distance?.(dist);
    // リンクの引きを弱め、ハブ周りの過密を緩和
    link.strength?.(0.032);
  }
}

/**
 * ノード・エッジが増えるほど 1 フレームの描画コストが跳ね上がるため、
 * シミュレーション歩数をスケールダウンして初期レイアウトの総コストを抑える。
 */
function simulationTicksForScale(nodeCount: number, edgeCount: number): {
  warmupTicks: number;
  cooldownTicks: number;
} {
  const denom = nodeCount + edgeCount * 0.45 + 400;
  // 以前よりやや短めにし、初期レイアウトの CPU 時間を抑える
  const cooldownTicks = Math.max(64, Math.min(340, Math.floor(2_450_000 / denom)));
  const warmupTicks = Math.min(90, Math.max(20, Math.floor(cooldownTicks * 0.22)));
  return { warmupTicks, cooldownTicks };
}

function PersonGraphInner({
  data,
  mode,
  sizeMode,
  focusId,
  onNodeClick,
  onBackgroundClick,
}: {
  data: GraphData;
  mode: "2d" | "3d";
  sizeMode: NodeSizeMode;
  focusId: string | null;
  onNodeClick: (n: PersonNode) => void;
  onBackgroundClick?: () => void;
}) {
  const fg2 = useRef<FG2Methods | undefined>(undefined);
  const fg3 = useRef<FG3Methods | undefined>(undefined);

  const graphData = useMemo((): FG2GraphData & FG3GraphData => {
    const dim3 = mode === "3d";
    const nodes = data.nodes.map((n) => {
      const __size = sizeFor(n, sizeMode);
      const p = initialXYZ(String(n.id), dim3);
      return {
        ...n,
        __size,
        x: p.x,
        y: p.y,
        ...(dim3 && p.z !== undefined ? { z: p.z } : {}),
      };
    });
    const links = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      mutual: e.mutual === true,
    }));
    return { nodes, links };
  }, [data, sizeMode, mode]);

  const nodeCount = graphData.nodes.length;
  const edgeCount = graphData.links.length;
  const { warmupTicks, cooldownTicks } = simulationTicksForScale(nodeCount, edgeCount);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      if (mode === "2d") {
        applyForces(fg2.current, nodeCount);
        fg2.current?.d3ReheatSimulation?.();
      } else {
        applyForces(fg3.current, nodeCount);
        fg3.current?.d3ReheatSimulation?.();
      }
    });
    return () => cancelAnimationFrame(t);
  }, [graphData, mode, nodeCount]);

  useEffect(() => {
    if (!focusId) return;
    const n = graphData.nodes.find((x) => x.id === focusId) as PersonNode & {
      x?: number;
      y?: number;
      z?: number;
    };
    if (!n || n.x === undefined || n.y === undefined) return;

    const g2 = fg2.current;
    if (mode === "2d" && g2) {
      g2.centerAt(n.x, n.y, 400);
      g2.zoom(3.5, 400);
    }
    const g3 = fg3.current;
    if (mode === "3d" && g3) {
      const z = n.z ?? 0;
      const dist = 280;
      const mag = Math.hypot(n.x, n.y, z) || 1;
      const k = 1 + dist / mag;
      g3.cameraPosition({ x: n.x * k, y: n.y * k, z: z * k }, { x: n.x, y: n.y, z }, 500);
    }
  }, [focusId, mode, graphData.nodes]);

  const handleClick = useCallback(
    (node: object) => {
      onNodeClick(node as PersonNode);
    },
    [onNodeClick],
  );

  const nodeLabel = useCallback((n: object) => (n as PersonNode).title, []);
  const nodeVal = useCallback((n: object) => (n as { __size: number }).__size, []);
  const nodeColor = useCallback(() => "#2563eb", []);
  const linkColor = useCallback((link: object) => {
    const mutual = (link as { mutual?: boolean }).mutual;
    return mutual ? "rgba(37,99,235,0.38)" : "rgba(100,116,139,0.22)";
  }, []);
  const linkWidth = useCallback((link: object) => ((link as { mutual?: boolean }).mutual ? 0.9 : 0.45), []);
  const linkColor3d = useCallback((link: object) => {
    const mutual = (link as { mutual?: boolean }).mutual;
    return mutual ? "rgba(37,99,235,0.42)" : "rgba(100,116,139,0.2)";
  }, []);
  const linkWidth3d = useCallback((link: object) => ((link as { mutual?: boolean }).mutual ? 0.35 : 0.2), []);

  if (mode === "2d") {
    return (
      <ForceGraph2D
        ref={fg2}
        graphData={graphData}
        nodeId="id"
        linkDirectionalArrowLength={0}
        linkDirectionalArrowRelPos={1}
        nodeLabel={nodeLabel}
        nodeVal={nodeVal}
        nodeColor={nodeColor}
        linkColor={linkColor}
        linkWidth={linkWidth}
        backgroundColor="#ffffff"
        onNodeClick={handleClick}
        onBackgroundClick={onBackgroundClick}
        warmupTicks={warmupTicks}
        cooldownTicks={cooldownTicks}
        d3VelocityDecay={0.48}
        d3AlphaDecay={0.045}
        d3AlphaMin={0.022}
      />
    );
  }

  return (
    <ForceGraph3D
      ref={fg3}
      graphData={graphData}
      nodeId="id"
      linkDirectionalArrowLength={0}
      linkDirectionalArrowRelPos={1}
      nodeLabel={nodeLabel}
      nodeVal={nodeVal}
      nodeColor={nodeColor}
      linkColor={linkColor3d}
      linkWidth={linkWidth3d}
      backgroundColor="#ffffff"
      onNodeClick={handleClick}
      onBackgroundClick={onBackgroundClick}
      showNavInfo={false}
      nodeResolution={6}
      linkResolution={6}
      warmupTicks={warmupTicks}
      cooldownTicks={cooldownTicks}
      d3VelocityDecay={0.48}
      d3AlphaDecay={0.045}
      d3AlphaMin={0.022}
    />
  );
}

export const PersonGraph = memo(PersonGraphInner);
