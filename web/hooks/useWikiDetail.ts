"use client";

import { useCallback, useState } from "react";
import { fetchJaWikiSummary } from "@/lib/wikipedia";
import type { PersonNode } from "@/types/graph";

export type DetailState =
  | { status: "idle" }
  | { status: "loading"; node: PersonNode }
  | {
      status: "ready";
      node: PersonNode;
      extract: string;
      thumbnail: string | null;
      articleUrl: string;
    }
  | { status: "error"; node: PersonNode; message: string; articleUrl: string };

const cache = new Map<string, { extract: string; thumbnail: string | null; articleUrl: string }>();

export function useWikiDetail() {
  const [detail, setDetail] = useState<DetailState>({ status: "idle" });

  const load = useCallback(async (node: PersonNode) => {
    const key = node.id;
    const hit = cache.get(key);
    if (hit) {
      setDetail({ status: "ready", node, ...hit });
      return;
    }
    setDetail({ status: "loading", node });
    const data = await fetchJaWikiSummary(node.title);
    if ("error" in data) {
      setDetail({
        status: "error",
        node,
        message: data.error,
        articleUrl: node.url,
      });
      return;
    }
    const articleUrl = data.content_urls?.desktop?.page || node.url;
    let thumbnail: string | null = null;
    if (typeof data.thumbnail === "string") thumbnail = data.thumbnail;
    else if (data.thumbnail && typeof data.thumbnail === "object" && "source" in data.thumbnail) {
      thumbnail = String((data.thumbnail as { source: string }).source);
    }
    const extract = data.extract || "";
    cache.set(key, { extract, thumbnail, articleUrl });
    setDetail({
      status: "ready",
      node,
      extract,
      thumbnail,
      articleUrl,
    });
  }, []);

  const clear = useCallback(() => setDetail({ status: "idle" }), []);

  return { detail, load, clear };
}
