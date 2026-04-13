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

/** 物理シミュレーションなしの固定座標（タイトル由来のハッシュで安定配置） */
export function layoutXYZ(id: string, dim3: boolean): { x: number; y: number; z?: number } {
  const jx = (hash01(`${id}:jx`) - 0.5) * 2 * JITTER;
  const jy = (hash01(`${id}:jy`) - 0.5) * 2 * JITTER;
  const x = (hash01(`${id}:x`) - 0.5) * 2 * BOX_HALF + jx;
  const y = (hash01(`${id}:y`) - 0.5) * 2 * BOX_HALF + jy;
  if (!dim3) return { x, y };
  const jz = (hash01(`${id}:jz`) - 0.5) * 2 * JITTER;
  const z = (hash01(`${id}:z`) - 0.5) * 2 * BOX_HALF + jz;
  return { x, y, z };
}

export function sizeFor(node: PersonNode, mode: NodeSizeMode): number {
  let raw: number;
  if (mode === "betweenness") raw = 1 + (node.betweenness ?? 0) * 48;
  else if (mode === "degree") raw = 1 + (node.degree ?? 0) * 0.85;
  else raw = 1 + (node.inboundLinksCount ?? 0) * 0.45;
  return Math.min(22, Math.max(2, raw));
}
