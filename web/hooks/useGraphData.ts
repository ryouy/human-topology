"use client";

import { startTransition, useEffect, useState } from "react";
import type { GraphData } from "@/types/graph";

export function useGraphData(url = "/graph.json") {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load graph: ${res.status}`);
        const json = (await res.json()) as GraphData;
        if (cancelled) return;
        // 巨大 JSON 適用後の再レンダーを低優先度にし、メインスレッドの固まりを減らす
        startTransition(() => {
          if (!cancelled) setData(json);
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "load error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data, error };
}
