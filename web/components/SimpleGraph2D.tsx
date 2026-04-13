"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphData, NodeSizeMode, PersonNode } from "@/types/graph";
import { layoutXYZ, sizeFor } from "@/lib/graphLayout";
import { nodeSubtitle } from "@/lib/nodeBlurb";

type View2D = { scale: number; offsetX: number; offsetY: number };

function screenToGraph(
  sx: number,
  sy: number,
  w: number,
  h: number,
  t: View2D,
): { gx: number; gy: number } {
  return {
    gx: (sx - w / 2 - t.offsetX) / t.scale,
    gy: (sy - h / 2 - t.offsetY) / t.scale,
  };
}

export function SimpleGraph2D({
  data,
  sizeMode,
  focusId,
  cameraFollowHover = false,
  searchCandidateIds = [],
  showEdges = true,
  onNodeClick,
  onBackgroundClick,
}: {
  data: GraphData;
  sizeMode: NodeSizeMode;
  focusId: string | null;
  /** Strong ties 一覧から選んだあと、ホバー中のノードへビューを合わせる */
  cameraFollowHover?: boolean;
  /** 検索候補（確定選択より弱い強調） */
  searchCandidateIds?: string[];
  showEdges?: boolean;
  onNodeClick: (n: PersonNode) => void;
  onBackgroundClick?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View2D>({ scale: 0.35, offsetX: 0, offsetY: 0 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  /** 複数ポインタを使った操作があったらノードクリックにしない */
  const multiPointerGestureRef = useRef(false);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const prevCentroidRef = useRef<{ x: number; y: number } | null>(null);
  /** focusId が変わったときだけ選択ノードへ合わせる（タッチ／ピンチ後に戻さない） */
  const prevFocusIdForViewRef = useRef<string | null | undefined>(undefined);
  const onNodeClickRef = useRef(onNodeClick);
  const onBackgroundClickRef = useRef(onBackgroundClick);
  onNodeClickRef.current = onNodeClick;
  onBackgroundClickRef.current = onBackgroundClick;

  const positions = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const n of data.nodes) {
      const p = layoutXYZ(String(n.id), false);
      m.set(String(n.id), { x: p.x, y: p.y });
    }
    return m;
  }, [data.nodes]);

  const searchCandidateSet = useMemo(
    () => new Set(searchCandidateIds.map((id) => String(id))),
    [searchCandidateIds],
  );

  const [viewTick, setViewTick] = useState(0);
  const bumpView = useCallback(() => setViewTick((x) => x + 1), []);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverTip, setHoverTip] = useState<{
    x: number;
    y: number;
    node: PersonNode;
  } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 1 || h < 1) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const t = viewRef.current;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + t.offsetX, h / 2 + t.offsetY);
    ctx.scale(t.scale, t.scale);

    const mutualEdges: typeof data.edges = [];
    const otherEdges: typeof data.edges = [];
    for (const e of data.edges) {
      if (e.mutual === true) mutualEdges.push(e);
      else otherEdges.push(e);
    }

    const stroke = (edges: typeof data.edges, color: string, lineWidth: number) => {
      if (edges.length === 0) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth / t.scale;
      for (const e of edges) {
        const a = positions.get(String(e.source));
        const b = positions.get(String(e.target));
        if (!a || !b) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    };

    if (showEdges) {
      stroke(otherEdges, "rgba(100,116,139,0.22)", 0.45);
      stroke(mutualEdges, "rgba(37,99,235,0.38)", 0.9);
    }

    const focusStr = focusId != null ? String(focusId) : null;

    for (const n of data.nodes) {
      const p = positions.get(String(n.id));
      if (!p) continue;
      const r = sizeFor(n, sizeMode);
      const sid = String(n.id);
      const isFocus = focusStr !== null && sid === focusStr;
      const isHover = hoveredId !== null && sid === hoveredId;
      const isCandidate = searchCandidateSet.has(sid) && !isFocus;
      /** ホバー時だけ少し大きく（当たり判定は r のまま） */
      const drawR = isHover ? r * 1.12 : isFocus ? r * 1.04 : r;

      ctx.beginPath();
      ctx.arc(p.x, p.y, drawR, 0, Math.PI * 2);
      if (isFocus) {
        ctx.fillStyle = "#fb923c";
      } else if (isHover) {
        ctx.fillStyle = "#f472b6";
      } else if (isCandidate) {
        ctx.fillStyle = "#38bdf8";
      } else {
        ctx.fillStyle = "#6366f1";
      }
      ctx.fill();

      if (isFocus) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, drawR + 2.8 / t.scale, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(234, 88, 12, 0.92)";
        ctx.lineWidth = 2.2 / t.scale;
        ctx.stroke();
      } else if (isHover) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, drawR + 2.6 / t.scale, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(219, 39, 119, 0.88)";
        ctx.lineWidth = 2 / t.scale;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, drawR + 5 / t.scale, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(244, 114, 182, 0.35)";
        ctx.lineWidth = 1.4 / t.scale;
        ctx.stroke();
      } else if (isCandidate) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, drawR + 2.2 / t.scale, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
        ctx.lineWidth = 1.6 / t.scale;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [
    data.edges,
    data.nodes,
    positions,
    sizeMode,
    viewTick,
    focusId,
    searchCandidateSet,
    showEdges,
    hoveredId,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  const fitBounds = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w < 10 || h < 10) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of data.nodes) {
      const p = positions.get(String(n.id));
      if (!p) continue;
      const r = sizeFor(n, sizeMode);
      minX = Math.min(minX, p.x - r);
      maxX = Math.max(maxX, p.x + r);
      minY = Math.min(minY, p.y - r);
      maxY = Math.max(maxY, p.y + r);
    }
    if (!Number.isFinite(minX)) return;
    const gw = Math.max(maxX - minX, 80);
    const gh = Math.max(maxY - minY, 80);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const s = Math.min(w / (gw * 1.15), h / (gh * 1.15), 2);
    viewRef.current = { scale: s, offsetX: -cx * s, offsetY: -cy * s };
    bumpView();
  }, [data.nodes, positions, sizeMode, bumpView]);

  useEffect(() => {
    if (cameraFollowHover && hoveredId) {
      const p = positions.get(String(hoveredId));
      if (p) {
        const zs = 1.75;
        viewRef.current = { scale: zs, offsetX: -p.x * zs, offsetY: -p.y * zs };
        bumpView();
      }
      return;
    }

    const fid = focusId != null ? String(focusId) : null;
    if (prevFocusIdForViewRef.current === fid) {
      return;
    }
    prevFocusIdForViewRef.current = fid;
    if (focusId) {
      const p = positions.get(String(focusId));
      if (p) {
        const zs = 1.75;
        viewRef.current = { scale: zs, offsetX: -p.x * zs, offsetY: -p.y * zs };
        bumpView();
      }
      return;
    }
    fitBounds();
  }, [cameraFollowHover, hoveredId, focusId, positions, fitBounds, bumpView]);

  const pickNode = useCallback(
    (sx: number, sy: number): PersonNode | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const t = viewRef.current;
      const { gx, gy } = screenToGraph(sx, sy, w, h, t);
      for (let i = data.nodes.length - 1; i >= 0; i--) {
        const n = data.nodes[i];
        const p = positions.get(String(n.id));
        if (!p) continue;
        const r = sizeFor(n, sizeMode);
        if ((gx - p.x) ** 2 + (gy - p.y) ** 2 <= r * r) return n;
      }
      return null;
    },
    [data.nodes, positions, sizeMode],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const t = viewRef.current;
      const px = (sx - w / 2 - t.offsetX) / t.scale;
      const py = (sy - h / 2 - t.offsetY) / t.scale;
      const factor = e.deltaY > 0 ? 0.88 : 1.12;
      const newScale = Math.max(0.02, Math.min(120, t.scale * factor));
      viewRef.current = {
        scale: newScale,
        offsetX: sx - w / 2 - px * newScale,
        offsetY: sy - h / 2 - py * newScale,
      };
      bumpView();
    };

    const centroid = (): { x: number; y: number } | null => {
      const m = activePointersRef.current;
      if (m.size === 0) return null;
      let sx = 0;
      let sy = 0;
      for (const p of m.values()) {
        sx += p.x;
        sy += p.y;
      }
      const n = m.size;
      return { x: sx / n, y: sy / n };
    };

    const onPointerDown = (e: PointerEvent) => {
      const m = activePointersRef.current;
      m.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (m.size >= 2) {
        multiPointerGestureRef.current = true;
        prevCentroidRef.current = centroid();
        movedRef.current = true;
      } else {
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        movedRef.current = false;
      }
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    /** スマホは二本指でパン（単指はノード操作）。マウスは左ドラッグ・Shift+ドラッグ・中・右でパン */
    const canSinglePointerPan = (e: PointerEvent): boolean => {
      if (e.pointerType === "touch") return false;
      if ((e.buttons & 4) !== 0 || (e.buttons & 2) !== 0) return true;
      if ((e.buttons & 1) === 0) return false;
      return true;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activePointersRef.current.has(e.pointerId)) {
        if (activePointersRef.current.size === 0 && e.buttons === 0) {
          const cr = canvas.getBoundingClientRect();
          const wr = wrap.getBoundingClientRect();
          const sx = e.clientX - cr.left;
          const sy = e.clientY - cr.top;
          const n = pickNode(sx, sy);
          if (n) {
            setHoveredId(String(n.id));
            setHoverTip({
              x: e.clientX - wr.left + 14,
              y: e.clientY - wr.top - 8,
              node: n,
            });
          } else {
            setHoveredId(null);
            setHoverTip(null);
          }
        }
        return;
      }
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const nPtr = activePointersRef.current.size;
      if (nPtr >= 2) {
        const c = centroid();
        const prev = prevCentroidRef.current;
        if (c && prev) {
          const t = viewRef.current;
          viewRef.current = {
            ...t,
            offsetX: t.offsetX + (c.x - prev.x),
            offsetY: t.offsetY + (c.y - prev.y),
          };
          bumpView();
        }
        prevCentroidRef.current = c;
        multiPointerGestureRef.current = true;
        movedRef.current = true;
        setHoveredId(null);
        setHoverTip(null);
        return;
      }

      if (!dragStartRef.current) return;
      if (!canSinglePointerPan(e)) return;

      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 4) movedRef.current = true;
      if (movedRef.current) {
        setHoveredId(null);
        setHoverTip(null);
        const t = viewRef.current;
        viewRef.current = {
          ...t,
          offsetX: t.offsetX + e.movementX,
          offsetY: t.offsetY + e.movementY,
        };
        bumpView();
      }
    };

    const finishPointerUp = (e: PointerEvent) => {
      activePointersRef.current.delete(e.pointerId);
      const remaining = activePointersRef.current.size;

      if (remaining === 1) {
        const only = [...activePointersRef.current.values()][0];
        prevCentroidRef.current = null;
        dragStartRef.current = { x: only.x, y: only.y };
        movedRef.current = false;
        return;
      }

      if (remaining > 0) return;

      prevCentroidRef.current = null;

      if (e.button !== 0 || !dragStartRef.current) {
        dragStartRef.current = null;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const wasDrag =
        movedRef.current || multiPointerGestureRef.current || Math.hypot(dx, dy) > 6;
      dragStartRef.current = null;
      movedRef.current = false;
      multiPointerGestureRef.current = false;
      if (wasDrag) return;
      const n = pickNode(sx, sy);
      if (n) onNodeClickRef.current(n);
      else onBackgroundClickRef.current?.();
    };

    const onPointerUp = (e: PointerEvent) => {
      finishPointerUp(e);
    };

    const onPointerCancel = (e: PointerEvent) => {
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size === 0) {
        dragStartRef.current = null;
        movedRef.current = false;
        multiPointerGestureRef.current = false;
        prevCentroidRef.current = null;
      }
    };

    const onContextMenu = (e: Event) => {
      e.preventDefault();
    };

    const onPointerLeave = () => {
      setHoveredId(null);
      setHoverTip(null);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("pointerleave", onPointerLeave);

    return () => {
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [draw, pickNode, bumpView]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        className={`block h-full w-full touch-none ${hoveredId ? "cursor-pointer" : "cursor-default"}`}
        role="presentation"
      />
      {hoverTip && (
        <div
          className="pointer-events-none absolute z-30 max-w-[min(280px,calc(100%-24px))] -translate-y-full rounded-lg border border-slate-200/90 bg-white/95 px-3 py-2 text-left shadow-lg backdrop-blur-sm"
          style={{ left: hoverTip.x, top: hoverTip.y }}
        >
          <p className="text-sm font-semibold text-slate-900">{hoverTip.node.title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{nodeSubtitle(hoverTip.node)}</p>
        </div>
      )}
    </div>
  );
}
