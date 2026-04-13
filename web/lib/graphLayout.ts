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

export function sizeFor(node: PersonNode, mode: NodeSizeMode): number {
  let raw: number;
  if (mode === "betweenness") raw = 1 + (node.betweenness ?? 0) * 48;
  else if (mode === "degree") raw = 1 + (node.degree ?? 0) * 0.85;
  else raw = 1 + (node.inboundLinksCount ?? 0) * 0.45;
  return Math.min(22, Math.max(2, raw));
}
