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
  cameraFollowHover = false,
  searchCandidateIds = [],
  showEdges = true,
  isMobile,
  onNodeClick,
  onBackgroundClick,
}: {
  data: GraphData;
  mode: "2d" | "3d";
  sizeMode: NodeSizeMode;
  focusId: string | null;
  /** Strong ties 一覧から選んだ直後など、ホバー先へカメラ／ビューを合わせる */
  cameraFollowHover?: boolean;
  /** 人物検索の候補（確定前）。確定ノード（focusId）より弱い強調 */
  searchCandidateIds?: string[];
  showEdges?: boolean;
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
        cameraFollowHover={cameraFollowHover}
        searchCandidateIds={searchCandidateIds}
        showEdges={showEdges}
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
      cameraFollowHover={cameraFollowHover}
      searchCandidateIds={searchCandidateIds}
      showEdges={showEdges}
      onNodeClick={onNodeClick}
      onBackgroundClick={onBackgroundClick}
      isMobile={isMobile}
    />
  );
}

export const PersonGraph = memo(PersonGraphInner);
