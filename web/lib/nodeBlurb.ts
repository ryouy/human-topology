import type { PersonNode } from "@/types/graph";

/** Short line for tooltips when extract is not in graph data */
export function nodeSubtitle(n: PersonNode): string {
  const parts: string[] = [];
  if (n.inboundLinksCount != null) parts.push(`${n.inboundLinksCount} in-links`);
  if (n.degree != null) parts.push(`degree ${n.degree}`);
  return parts.length > 0 ? parts.join(" · ") : "Wikipedia biography";
}
