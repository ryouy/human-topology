import type { NodeSizeMode, PersonNode } from "@/types/graph";

const BOX_HALF = 720;
const JITTER = 220;

export function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

/**
 * 物理シミュレーションなしの固定座標（ID 由来のハッシュで安定配置）。
 * 次元ごとの値は「文字列末尾だけ違う」形（`${id}:x` / `:y`）にしないこと。
 * 末尾1文字差だと FNV の入力がほぼ同じになり、x と y が強く相関して対角線上に潰れる。
 */
export function layoutXYZ(id: string, dim3: boolean): { x: number; y: number; z?: number } {
  const jx = (hash01(`jx|${id}`) - 0.5) * 2 * JITTER;
  const jy = (hash01(`jy|${id}`) - 0.5) * 2 * JITTER;
  const x = (hash01(`x|${id}`) - 0.5) * 2 * BOX_HALF + jx;
  const y = (hash01(`y|${id}`) - 0.5) * 2 * BOX_HALF + jy;
  if (!dim3) return { x, y };
  const jz = (hash01(`jz|${id}`) - 0.5) * 2 * JITTER;
  const z = (hash01(`z|${id}`) - 0.5) * 2 * BOX_HALF + jz;
  return { x, y, z };
}

export type LayoutBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

/** graph.json の spring 座標が十分あるときだけバウンディングを返す */
export function computeLayoutBounds(nodes: PersonNode[]): LayoutBounds | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (const n of nodes) {
    if (n.x != null && n.y != null && Number.isFinite(n.x) && Number.isFinite(n.y)) {
      xs.push(n.x);
      ys.push(n.y);
    }
    if (n.z != null && Number.isFinite(n.z)) zs.push(n.z);
  }
  if (xs.length < nodes.length * 0.5) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minZ = zs.length === 0 ? 0 : Math.min(...zs);
  const maxZ = zs.length === 0 ? 0 : Math.max(...zs);
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function normToBox(v: number, minV: number, span: number): number {
  return ((v - minV) / Math.max(span, 1e-12) - 0.5) * 2 * BOX_HALF;
}

/**
 * パイプラインが付与した x,y,z（spring）を優先。無いノードはハッシュ配置。
 */
export function layoutPositionForNode(
  n: PersonNode,
  dim3: boolean,
  bounds: LayoutBounds | null,
): { x: number; y: number; z?: number } {
  const hasXY =
    bounds != null &&
    n.x != null &&
    n.y != null &&
    Number.isFinite(n.x) &&
    Number.isFinite(n.y);
  if (!hasXY) {
    return layoutXYZ(String(n.id), dim3);
  }
  if (dim3 && (n.z == null || !Number.isFinite(n.z))) {
    return layoutXYZ(String(n.id), dim3);
  }
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const spanZ = bounds.maxZ - bounds.minZ;
  const x = normToBox(n.x as number, bounds.minX, spanX);
  const y = normToBox(n.y as number, bounds.minY, spanY);
  if (!dim3) return { x, y };
  const z = normToBox((n.z as number) ?? 0, bounds.minZ, Math.max(spanZ, 1e-12));
  return { x, y, z };
}

export function buildPositionMap(
  nodes: PersonNode[],
  dim3: boolean,
): Map<string, { x: number; y: number; z: number }> {
  const bounds = computeLayoutBounds(nodes);
  const m = new Map<string, { x: number; y: number; z: number }>();
  for (const n of nodes) {
    const p = layoutPositionForNode(n, dim3, bounds);
    m.set(String(n.id), { x: p.x, y: p.y, z: p.z ?? 0 });
  }
  return m;
}

export function sizeFor(node: PersonNode, mode: NodeSizeMode): number {
  let raw: number;
  if (mode === "betweenness") raw = 1 + (node.betweenness ?? 0) * 48;
  else if (mode === "degree") raw = 1 + Math.log1p(Math.max(0, node.degree ?? 0)) * 5.2;
  else raw = 1 + Math.log1p(Math.max(0, node.inboundLinksCount ?? 0)) * 3.8;
  return Math.min(22, Math.max(2, raw));
}
