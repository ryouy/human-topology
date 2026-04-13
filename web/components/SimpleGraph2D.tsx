"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphData, NodeSizeMode, PersonNode } from "@/types/graph";
import { layoutXYZ, sizeFor } from "@/lib/graphLayout";

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
  onNodeClick,
  onBackgroundClick,
}: {
  data: GraphData;
  sizeMode: NodeSizeMode;
  focusId: string | null;
  onNodeClick: (n: PersonNode) => void;
  onBackgroundClick?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View2D>({ scale: 0.35, offsetX: 0, offsetY: 0 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
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

  const [viewTick, setViewTick] = useState(0);
  const bumpView = useCallback(() => setViewTick((x) => x + 1), []);

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

    stroke(otherEdges, "rgba(100,116,139,0.22)", 0.45);
    stroke(mutualEdges, "rgba(37,99,235,0.38)", 0.9);

    for (const n of data.nodes) {
      const p = positions.get(String(n.id));
      if (!p) continue;
      const r = sizeFor(n, sizeMode);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#2563eb";
      ctx.fill();
    }

    ctx.restore();
  }, [data.edges, data.nodes, positions, sizeMode, viewTick]);

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
    if (focusId) {
      const p = positions.get(String(focusId));
      if (p) {
        const zs = 3.2;
        viewRef.current = { scale: zs, offsetX: -p.x * zs, offsetY: -p.y * zs };
        bumpView();
      }
      return;
    }
    fitBounds();
  }, [focusId, positions, fitBounds, bumpView]);

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

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      movedRef.current = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragStartRef.current || !(e.buttons & 1)) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 4) movedRef.current = true;
      if (movedRef.current) {
        const t = viewRef.current;
        viewRef.current = {
          ...t,
          offsetX: t.offsetX + e.movementX,
          offsetY: t.offsetY + e.movementY,
        };
        bumpView();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0 || !dragStartRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const wasDrag = movedRef.current || Math.hypot(dx, dy) > 6;
      dragStartRef.current = null;
      movedRef.current = false;
      if (wasDrag) return;
      const n = pickNode(sx, sy);
      if (n) onNodeClickRef.current(n);
      else onBackgroundClickRef.current?.();
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [draw, pickNode, bumpView]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-white">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" role="presentation" />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[10px] text-slate-500 shadow">
        ホイールで拡大縮小 · ドラッグで表示移動 · ノードをクリックで詳細
      </div>
    </div>
  );
}
