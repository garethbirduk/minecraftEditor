/**
 * three.js voxel viewport.
 *
 * Renders a VoxelGrid as a single InstancedMesh of unit cubes — one instance
 * per *visible* solid block. Visibility = "has at least one face exposed to a
 * transparent/empty neighbour", so fully-enclosed interior blocks are skipped.
 * That hidden-face cull keeps even large structures (a 12-floor tower is a few
 * thousand visible cubes) comfortably at 60fps.
 *
 * Colour comes from the flat block->colour map via setColorAt.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EMPTY, VoxelGrid } from "../core/model/grid.js";
import { colorForBlock, isTransparentBlock } from "../core/blocks/colors.js";

interface Props {
  grid: VoxelGrid | null;
  /** Changes only when a different component is selected. The camera re-frames
   *  on a new frameKey, but NOT on every grid edit — so nudging an offset keeps
   *  your current view instead of resetting it. */
  frameKey: string;
}

interface Visible {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
}

function collectVisible(grid: VoxelGrid): Visible[] {
  const out: Visible[] = [];
  const opaque = (x: number, y: number, z: number): boolean => {
    const b = grid.blockAt(x, y, z);
    return b != null && !isTransparentBlock(b.name);
  };
  for (let x = 0; x < grid.sx; x++) {
    for (let y = 0; y < grid.sy; y++) {
      for (let z = 0; z < grid.sz; z++) {
        const v = grid.cells[grid.index(x, y, z)]!;
        if (v === EMPTY) continue;
        const b = grid.palette[v];
        if (!b || isTransparentBlock(b.name)) continue;
        const exposed =
          !opaque(x + 1, y, z) ||
          !opaque(x - 1, y, z) ||
          !opaque(x, y + 1, z) ||
          !opaque(x, y - 1, z) ||
          !opaque(x, y, z + 1) ||
          !opaque(x, y, z - 1);
        if (!exposed) continue;
        out.push({ x, y, z, color: new THREE.Color(colorForBlock(b.name)) });
      }
    }
  }
  return out;
}

export function Viewport3D({ grid, frameKey }: Props): JSX.Element {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    content: THREE.Group;
    raf: number;
  } | null>(null);

  // One-time scene setup.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0d0d12");

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    camera.position.set(40, 40, 60);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.className = "viewport-canvas";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(1, 2, 1.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-1, 0.5, -1);
    scene.add(fill);

    const content = new THREE.Group();
    scene.add(content);

    const resize = (): void => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const state = { renderer, scene, camera, controls, content, raf: 0 };
    const loop = (): void => {
      controls.update();
      renderer.render(scene, camera);
      state.raf = requestAnimationFrame(loop);
    };
    loop();
    sceneRef.current = state;

    return () => {
      cancelAnimationFrame(state.raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // Rebuild geometry whenever the grid changes — but DON'T touch the camera,
  // so editing offsets keeps the current view.
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    const { content } = state;

    for (const child of [...content.children]) {
      content.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      } else if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    if (!grid || grid.volume === 0) return;

    const visible = collectVisible(grid);
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial();
    const mesh = new THREE.InstancedMesh(geom, mat, Math.max(1, visible.length));
    const m = new THREE.Matrix4();
    visible.forEach((v, i) => {
      m.makeTranslation(v.x + 0.5, v.y + 0.5, v.z + 0.5);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, v.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    content.add(mesh);

    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(grid.sx, grid.sy, grid.sz)),
      new THREE.LineBasicMaterial({ color: 0x2a2b35 }),
    );
    box.position.set(grid.sx / 2, grid.sy / 2, grid.sz / 2);
    content.add(box);
  }, [grid]);

  // Re-centre + frame the camera ONLY when a different component is selected.
  useEffect(() => {
    const state = sceneRef.current;
    if (!state || !grid || grid.volume === 0) return;
    const { content, controls, camera } = state;
    content.position.set(-grid.sx / 2, -grid.sy / 2, -grid.sz / 2);
    const radius = Math.max(grid.sx, grid.sy, grid.sz) || 16;
    controls.target.set(0, 0, 0);
    camera.position.set(radius * 1.1, radius * 1.0, radius * 1.4);
    controls.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  return <div className="viewport-canvas" ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}
