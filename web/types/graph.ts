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

/** パイプラインが graph.json に書き込む無向次数の要約（疎密の目安） */
export type GraphDegreeDistribution = {
  undirectedDegreeMean: number;
  undirectedDegreeStdev: number;
  undirectedDegreeMin: number;
  undirectedDegreeMax: number;
  undirectedDegreeP50: number;
  undirectedDegreeP90: number;
  undirectedDegreeP99: number;
  /** 無向次数が 0 のノード数（孤立の目安） */
  undirectedIsolateCount?: number;
};

export type GraphMetadata = {
  graphType: string;
  nodeCount: number;
  edgeCount: number;
  generatedAt: string;
  distanceMode: "person_only_shortest_path";
  edgePolicy?: string;
  maxOneWayOutPerNode?: number;
  /** edge-policy mutual_symmetric_topk / mutual_union_topk / mutual_adaptive の中心 k */
  mutualTopK?: number;
  /** mutual_adaptive の cap ばらつき幅 */
  mutualCapSpread?: number;
  degreeDistribution?: GraphDegreeDistribution;
  /** パイプライン --politicians-only で生成したグラフ */
  politiciansOnly?: boolean;
};

export type GraphData = {
  nodes: PersonNode[];
  edges: PersonEdge[];
  metadata: GraphMetadata;
};

export type NodeSizeMode = "inboundLinksCount" | "degree" | "betweenness";
