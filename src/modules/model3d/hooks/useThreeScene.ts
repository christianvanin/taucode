import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function useThreeScene(containerRef: React.RefObject<HTMLDivElement | null>) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  const [wireframe, setWireframeState] = useState(false);
  const [showGrid, setShowGridState] = useState(true);

  // Inquadra automaticamente l'oggetto calcolando la bounding box
  const fitCameraToObject = useCallback((object: THREE.Object3D) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.6;
    if (cameraZ < 1) cameraZ = 1;

    // Posiziona camera leggermente inclinata a 45 gradi
    camera.position.set(center.x + cameraZ * 0.7, center.y + cameraZ * 0.5, center.z + cameraZ * 0.7);
    camera.near = cameraZ / 100;
    camera.far = cameraZ * 100;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.maxDistance = cameraZ * 10;
    controls.minDistance = cameraZ / 50;
    controls.update();

    // Adatta la griglia al modello
    if (gridHelperRef.current) {
      gridHelperRef.current.position.y = box.min.y;
      const gridSize = Math.max(maxDim * 2.5, 10);
      gridHelperRef.current.scale.set(gridSize / 10, 1, gridSize / 10);
    }
  }, []);

  // Toggle wireframe
  const setWireframe = useCallback((enabled: boolean) => {
    setWireframeState(enabled);
    if (!modelRootRef.current) return;
    modelRootRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          for (const mat of mesh.material) {
            if ("wireframe" in mat) (mat as any).wireframe = enabled;
          }
        } else if (mesh.material && "wireframe" in mesh.material) {
          (mesh.material as any).wireframe = enabled;
        }
      }
    });
  }, []);

  // Toggle grid
  const setShowGrid = useCallback((enabled: boolean) => {
    setShowGridState(enabled);
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = enabled;
    }
  }, []);

  // Inizializzazione scena WebGL
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 300;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(5, 4, 6);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // 5. Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(10, 20, 15);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xb0d0ff, 1.0);
    fillLight.position.set(-15, 10, -10);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xfff0dd, 0.8);
    rimLight.position.set(0, -10, -15);
    scene.add(rimLight);

    // 6. Ground Shadow Plane & Grid
    const isDark = document.documentElement.classList.contains("dark");
    const gridColor1 = isDark ? 0x444444 : 0xcccccc;
    const gridColor2 = isDark ? 0x222222 : 0xe0e0e0;
    const grid = new THREE.GridHelper(20, 20, gridColor1, gridColor2);
    grid.position.y = 0;
    gridHelperRef.current = grid;
    scene.add(grid);

    // 7. Model Root Group
    const modelRoot = new THREE.Group();
    scene.add(modelRoot);
    modelRootRef.current = modelRoot;

    // 8. Render loop
    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 9. ResizeObserver
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0 && cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = newW / newH;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(newW, newH);
        }
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }

      // Pulizia profonda geometrie e materiali
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            for (const m of mesh.material) m.dispose();
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        }
      });
    };
  }, [containerRef]);

  return {
    sceneRef,
    cameraRef,
    rendererRef,
    controlsRef,
    modelRootRef,
    fitCameraToObject,
    wireframe,
    setWireframe,
    showGrid,
    setShowGrid,
  };
}
