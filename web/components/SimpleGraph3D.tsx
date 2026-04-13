"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { MOUSE } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GraphData, NodeSizeMode, PersonNode } from "@/types/graph";
import { layoutXYZ, sizeFor } from "@/lib/graphLayout";
import { nodeSubtitle } from "@/lib/nodeBlurb";

function fitCameraToNodes(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  positions: Map<string, { x: number; y: number; z: number }>,
  nodes: PersonNode[],
  sizeMode: NodeSizeMode,
) {
  const box = new THREE.Box3();
  for (const n of nodes) {
    const p = positions.get(String(n.id));
    if (!p) continue;
    const r = sizeFor(n, sizeMode);
    box.expandByPoint(new THREE.Vector3(p.x + r, p.y + r, p.z + r));
    box.expandByPoint(new THREE.Vector3(p.x - r, p.y - r, p.z - r));
  }
  if (box.isEmpty()) {
    camera.position.set(0, 0, 2000);
    controls.target.set(0, 0, 0);
    controls.update();
    return;
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 120);
  const fov = (camera.fov * Math.PI) / 180;
  const dist = (maxDim / 2 / Math.tan(fov / 2)) * 1.25;
  camera.position.set(center.x, center.y, center.z + dist);
  controls.target.copy(center);
  controls.update();
}

function focusCameraOn(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  positions: Map<string, { x: number; y: number; z: number }>,
  id: string,
) {
  const p = positions.get(String(id));
  if (!p) return;
  const dist = 780;
  camera.position.set(p.x, p.y, p.z + dist);
  controls.target.set(p.x, p.y, p.z);
  controls.update();
}

export function SimpleGraph3D({
  data,
  sizeMode,
  focusId,
  cameraFollowHover = false,
  searchCandidateIds = [],
  showEdges = true,
  onNodeClick,
  onBackgroundClick,
  isMobile,
}: {
  data: GraphData;
  sizeMode: NodeSizeMode;
  focusId: string | null;
  /** Strong ties 一覧から選んだあと、ホバー中のノードへオービットを向ける */
  cameraFollowHover?: boolean;
  searchCandidateIds?: string[];
  showEdges?: boolean;
  onNodeClick: (n: PersonNode) => void;
  onBackgroundClick?: () => void;
  isMobile?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onBackgroundClickRef = useRef(onBackgroundClick);
  onNodeClickRef.current = onNodeClick;
  onBackgroundClickRef.current = onBackgroundClick;

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshListRef = useRef<THREE.Mesh[]>([]);
  const positionsRef = useRef<Map<string, { x: number; y: number; z: number }>>(new Map());
  const renderRef = useRef<(() => void) | null>(null);
  const matBaseRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const matCandidateRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const matFocusRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const matHoverRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const edgeGroupRef = useRef<THREE.Group | null>(null);
  /** focusId が変わったときだけ選択ノードへスナップ（ホバー解除で戻さない） */
  const prevFocusIdForCameraRef = useRef<string | null | undefined>(undefined);

  const focusIdRef = useRef<string | null>(null);
  const searchCandidateIdsRef = useRef<string[]>([]);
  const hoveredIdRef = useRef<string | null>(null);
  /** pointer から即時に色・スケールを反映（useEffect より確実） */
  const applyNodeMaterialsRef = useRef<(explicitHover?: string | null) => void>(() => {});

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverTip, setHoverTip] = useState<{
    x: number;
    y: number;
    node: PersonNode;
  } | null>(null);

  const positions = useMemo(() => {
    const m = new Map<string, { x: number; y: number; z: number }>();
    for (const n of data.nodes) {
      const p = layoutXYZ(String(n.id), true);
      m.set(String(n.id), { x: p.x, y: p.y, z: p.z ?? 0 });
    }
    return m;
  }, [data.nodes]);

  focusIdRef.current = focusId;
  searchCandidateIdsRef.current = searchCandidateIds;
  hoveredIdRef.current = hoveredId;

  applyNodeMaterialsRef.current = (explicitHover) => {
    const hid = explicitHover !== undefined ? explicitHover : hoveredIdRef.current;
    const meshes = meshListRef.current;
    const render = renderRef.current;
    const mb = matBaseRef.current;
    const mc = matCandidateRef.current;
    const mf = matFocusRef.current;
    const mh = matHoverRef.current;
    if (!meshes.length || !mb || !mc || !mf || !mh) return;

    const focusStr = focusIdRef.current != null ? String(focusIdRef.current) : null;
    const cand = new Set(searchCandidateIdsRef.current.map((id) => String(id)));
    for (const mesh of meshes) {
      const n = mesh.userData.personNode as PersonNode;
      const sid = String(n.id);
      const isFocus = focusStr !== null && sid === focusStr;
      const isHov = hid !== null && sid === hid;
      const isCand = cand.has(sid) && !isFocus;
      let mat = mb;
      if (isFocus) mat = mf;
      else if (isHov) mat = mh;
      else if (isCand) mat = mc;
      mesh.material = mat;
      if (isFocus) mesh.scale.setScalar(1.06);
      else if (isHov) mesh.scale.setScalar(1.14);
      else mesh.scale.setScalar(1);
    }
    render?.();
  };

  const sphereSeg = isMobile === true ? 8 : 12;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    positionsRef.current = positions;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xffffff, 1);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200_000);
    camera.position.set(0, 0, 2000);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.mouseButtons = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    };
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

    const render = () => renderer.render(scene, camera);
    renderRef.current = render;
    controls.addEventListener("change", render);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dl = new THREE.DirectionalLight(0xffffff, 0.35);
    dl.position.set(400, 800, 600);
    scene.add(dl);

    const posOther: number[] = [];
    const posMutual: number[] = [];
    for (const e of data.edges) {
      const a = positions.get(String(e.source));
      const b = positions.get(String(e.target));
      if (!a || !b) continue;
      const arr = e.mutual === true ? posMutual : posOther;
      arr.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }

    const matOther = new THREE.LineBasicMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.22,
    });
    const matMutual = new THREE.LineBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.38,
    });

    const edgeGroup = new THREE.Group();
    scene.add(edgeGroup);
    edgeGroupRef.current = edgeGroup;

    if (posOther.length > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(posOther, 3));
      edgeGroup.add(new THREE.LineSegments(g, matOther));
    }
    if (posMutual.length > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(posMutual, 3));
      edgeGroup.add(new THREE.LineSegments(g, matMutual));
    }

    const meshList: THREE.Mesh[] = [];
    const sphereGeomCache = new Map<number, THREE.SphereGeometry>();
    const matBase = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      roughness: 0.4,
      metalness: 0.14,
    });
    const matCandidate = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.36,
      metalness: 0.16,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.28,
    });
    const matFocus = new THREE.MeshStandardMaterial({
      color: 0xfb923c,
      roughness: 0.32,
      metalness: 0.14,
      emissive: 0xf97316,
      emissiveIntensity: 0.26,
    });
    const matHover = new THREE.MeshStandardMaterial({
      color: 0xf472b6,
      roughness: 0.3,
      metalness: 0.18,
      emissive: 0xf0abfc,
      emissiveIntensity: 0.32,
    });
    matBaseRef.current = matBase;
    matCandidateRef.current = matCandidate;
    matFocusRef.current = matFocus;
    matHoverRef.current = matHover;

    for (const n of data.nodes) {
      const p = positions.get(String(n.id));
      if (!p) continue;
      const r = sizeFor(n, sizeMode);
      const key = Math.round(r * 10);
      let geom = sphereGeomCache.get(key);
      if (!geom) {
        geom = new THREE.SphereGeometry(r, sphereSeg, sphereSeg);
        sphereGeomCache.set(key, geom);
      }
      const mesh = new THREE.Mesh(geom, matBase);
      mesh.position.set(p.x, p.y, p.z);
      mesh.userData.personNode = n;
      scene.add(mesh);
      meshList.push(mesh);
    }
    meshListRef.current = meshList;

    queueMicrotask(() => {
      applyNodeMaterialsRef.current();
    });

    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 1 || h < 1) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      render();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const dragStartRef = { x: 0, y: 0 };
    let moved = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragStartRef.x = e.clientX;
      dragStartRef.y = e.clientY;
      moved = false;
      hoveredIdRef.current = null;
      setHoveredId(null);
      setHoverTip(null);
      applyNodeMaterialsRef.current(null);
    };

    const onPointerMove = (e: PointerEvent) => {
      if ((e.buttons & 1) !== 0) {
        const dx = e.clientX - dragStartRef.x;
        const dy = e.clientY - dragStartRef.y;
        if (Math.hypot(dx, dy) > 5) moved = true;
        hoveredIdRef.current = null;
        setHoveredId(null);
        setHoverTip(null);
        applyNodeMaterialsRef.current(null);
        return;
      }
      const cam = cameraRef.current;
      const meshes = meshListRef.current;
      if (!cam || meshes.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, cam);
      const hits = raycaster.intersectObjects(meshes, false);
      const first = hits[0];
      if (first?.object instanceof THREE.Mesh && first.object.userData.personNode) {
        const pn = first.object.userData.personNode as PersonNode;
        const id = String(pn.id);
        hoveredIdRef.current = id;
        setHoveredId(id);
        const wr = wrap.getBoundingClientRect();
        setHoverTip({ x: e.clientX - wr.left + 14, y: e.clientY - wr.top - 8, node: pn });
        applyNodeMaterialsRef.current(id);
      } else {
        hoveredIdRef.current = null;
        setHoveredId(null);
        setHoverTip(null);
        applyNodeMaterialsRef.current(null);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const dx = e.clientX - dragStartRef.x;
      const dy = e.clientY - dragStartRef.y;
      const wasDrag = moved || Math.hypot(dx, dy) > 6;
      moved = false;
      if (wasDrag) return;

      const rect = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(meshListRef.current, false);
      const first = hits[0];
      if (first?.object instanceof THREE.Mesh && first.object.userData.personNode) {
        onNodeClickRef.current(first.object.userData.personNode as PersonNode);
      } else {
        onBackgroundClickRef.current?.();
      }
    };

    const onContextMenu = (e: Event) => {
      e.preventDefault();
    };

    const onPointerLeave = () => {
      hoveredIdRef.current = null;
      setHoveredId(null);
      setHoverTip(null);
      applyNodeMaterialsRef.current(null);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("contextmenu", onContextMenu);
      controls.removeEventListener("change", render);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
        }
      });
      for (const g of sphereGeomCache.values()) {
        g.dispose();
      }
      matBaseRef.current?.dispose();
      matCandidateRef.current?.dispose();
      matFocusRef.current?.dispose();
      matHoverRef.current?.dispose();
      matBaseRef.current = null;
      matCandidateRef.current = null;
      matFocusRef.current = null;
      matHoverRef.current = null;
      matOther.dispose();
      matMutual.dispose();
      scene.clear();
      renderer.dispose();
      cameraRef.current = null;
      controlsRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      meshListRef.current = [];
      renderRef.current = null;
      edgeGroupRef.current = null;
    };
  }, [data, sizeMode, positions, sphereSeg]);

  useEffect(() => {
    const g = edgeGroupRef.current;
    const render = renderRef.current;
    if (g) g.visible = showEdges;
    render?.();
  }, [showEdges]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const render = renderRef.current;
    if (!camera || !controls || !renderer || !scene || !render) return;

    if (cameraFollowHover && hoveredId) {
      focusCameraOn(camera, controls, positionsRef.current, hoveredId);
      render();
      return;
    }

    const fid = focusId != null ? String(focusId) : null;
    if (prevFocusIdForCameraRef.current === fid) {
      return;
    }
    prevFocusIdForCameraRef.current = fid;
    if (focusId) {
      focusCameraOn(camera, controls, positionsRef.current, focusId);
    } else {
      fitCameraToNodes(camera, controls, positionsRef.current, data.nodes, sizeMode);
    }
    render();
  }, [cameraFollowHover, hoveredId, focusId, data.nodes, sizeMode]);

  useEffect(() => {
    applyNodeMaterialsRef.current();
  }, [focusId, searchCandidateIds, hoveredId]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        className={`block h-full w-full touch-none ${hoveredId ? "cursor-pointer" : "cursor-default"}`}
        role="presentation"
      />
      {hoverTip && (
        <div
          className="pointer-events-none absolute z-30 max-w-[min(280px,calc(100%-24px))] -translate-y-full rounded-lg border border-slate-200/90 bg-white/95 px-3 py-2 text-left shadow-lg backdrop-blur-sm"
          style={{ left: hoverTip.x, top: hoverTip.y }}
        >
          <p className="text-sm font-semibold text-slate-900">{hoverTip.node.title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{nodeSubtitle(hoverTip.node)}</p>
        </div>
      )}
    </div>
  );
}
