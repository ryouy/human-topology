"use client";

import { memo } from "react";
import type { GraphData, NodeSizeMode, PersonNode } from "@/types/graph";
import { SimpleGraph2D } from "./SimpleGraph2D";
import { SimpleGraph3D } from "./SimpleGraph3D";

function PersonGraphInner({
  data,
  mode,
  sizeMode,
  focusId,
  isMobile,
  onNodeClick,
  onBackgroundClick,
}: {
  data: GraphData;
  mode: "2d" | "3d";
  sizeMode: NodeSizeMode;
  focusId: string | null;
  isMobile?: boolean;
  onNodeClick: (n: PersonNode) => void;
  onBackgroundClick?: () => void;
}) {
  if (mode === "2d") {
    return (
      <SimpleGraph2D
        data={data}
        sizeMode={sizeMode}
        focusId={focusId}
        onNodeClick={onNodeClick}
        onBackgroundClick={onBackgroundClick}
      />
    );
  }
  return (
    <SimpleGraph3D
      data={data}
      sizeMode={sizeMode}
      focusId={focusId}
      onNodeClick={onNodeClick}
      onBackgroundClick={onBackgroundClick}
      isMobile={isMobile}
    />
  );
}

export const PersonGraph = memo(PersonGraphInner);
