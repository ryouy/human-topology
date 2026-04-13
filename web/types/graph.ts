export type PersonNode = {
  id: string;
  title: string;
  url: string;
  wikipediaPageId?: number;
  imageUrl?: string | null;
  inboundLinksCount?: number;
  outboundLinksCount?: number;
  degree?: number;
  betweenness?: number;
  closeness?: number;
  x?: number;
  y?: number;
  z?: number;
  clusterId?: string | number;
};

export type PersonEdge = {
  source: string;
  target: string;
  directed: true;
  /** 逆方向のリンクも存在する（相互参照） */
  mutual?: boolean;
};

export type GraphMetadata = {
  graphType: string;
  nodeCount: number;
  edgeCount: number;
  generatedAt: string;
  distanceMode: "person_only_shortest_path";
  edgePolicy?: string;
  maxOneWayOutPerNode?: number;
  /** パイプライン --politicians-only で生成したグラフ */
  politiciansOnly?: boolean;
};

export type GraphData = {
  nodes: PersonNode[];
  edges: PersonEdge[];
  metadata: GraphMetadata;
};

export type NodeSizeMode = "inboundLinksCount" | "degree" | "betweenness";
