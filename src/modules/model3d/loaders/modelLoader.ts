import * as THREE from "three";
import { convertFileSrc } from "@tauri-apps/api/core";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { parseBBModel } from "./bbmodelLoader";
import type { ModelLoadResult, Model3dStats } from "../types";

function computeStats(root: THREE.Object3D, animations: THREE.AnimationClip[]): Model3dStats {
  let vertexCount = 0;
  let triangleCount = 0;
  let meshCount = 0;
  const materialsSet = new Set<THREE.Material>();

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      meshCount++;

      const geo = mesh.geometry;
      if (geo) {
        if (geo.index) {
          triangleCount += geo.index.count / 3;
        } else if (geo.attributes.position) {
          triangleCount += geo.attributes.position.count / 3;
        }
        if (geo.attributes.position) {
          vertexCount += geo.attributes.position.count;
        }
      }

      if (Array.isArray(mesh.material)) {
        for (const m of mesh.material) materialsSet.add(m);
      } else if (mesh.material) {
        materialsSet.add(mesh.material);
      }

      // Attiva ombreggiature automatiche per ogni mesh
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  return {
    vertexCount,
    triangleCount: Math.round(triangleCount),
    meshCount,
    animationCount: animations.length,
    materialCount: materialsSet.size,
  };
}

export async function loadModelFile(filePath: string, textContent?: string): Promise<ModelLoadResult> {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  // 1. Blockbench model
  if (ext === "bbmodel") {
    if (textContent) {
      return parseBBModel(textContent);
    }
    const assetUrl = convertFileSrc(filePath);
    const res = await fetch(assetUrl);
    if (!res.ok) throw new Error(`Impossibile leggere file .bbmodel: HTTP ${res.status}`);
    const jsonStr = await res.text();
    return parseBBModel(jsonStr);
  }

  const assetUrl = convertFileSrc(filePath);

  // 2. glTF / GLB (Khronos standard PBR + animazioni)
  if (ext === "glb" || ext === "gltf") {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        assetUrl,
        (gltf) => {
          const stats = computeStats(gltf.scene, gltf.animations || []);
          resolve({
            scene: gltf.scene,
            animations: gltf.animations || [],
            stats,
          });
        },
        undefined,
        (error) => reject(new Error(`Errore caricamento GLTF: ${error}`)),
      );
    });
  }

  // 3. FBX (Autodesk Rigs & Animations)
  if (ext === "fbx") {
    return new Promise((resolve, reject) => {
      const loader = new FBXLoader();
      loader.load(
        assetUrl,
        (group) => {
          const stats = computeStats(group, group.animations || []);
          resolve({
            scene: group,
            animations: group.animations || [],
            stats,
          });
        },
        undefined,
        (error) => reject(new Error(`Errore caricamento FBX: ${error}`)),
      );
    });
  }

  // 4. OBJ (Wavefront Mesh)
  if (ext === "obj") {
    return new Promise((resolve, reject) => {
      const loader = new OBJLoader();
      if (textContent) {
        try {
          const group = loader.parse(textContent);
          const stats = computeStats(group, []);
          resolve({ scene: group, animations: [], stats });
        } catch (e) {
          reject(e);
        }
        return;
      }
      loader.load(
        assetUrl,
        (group) => {
          const stats = computeStats(group, []);
          resolve({ scene: group, animations: [], stats });
        },
        undefined,
        (error) => reject(new Error(`Errore caricamento OBJ: ${error}`)),
      );
    });
  }

  // 5. STL (3D Printing geometry)
  if (ext === "stl") {
    return new Promise((resolve, reject) => {
      const loader = new STLLoader();
      loader.load(
        assetUrl,
        (geometry) => {
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({
            color: 0x90caf9,
            roughness: 0.5,
            metalness: 0.2,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const group = new THREE.Group();
          group.add(mesh);
          const stats = computeStats(group, []);
          resolve({ scene: group, animations: [], stats });
        },
        undefined,
        (error) => reject(new Error(`Errore caricamento STL: ${error}`)),
      );
    });
  }

  throw new Error(`Formato 3D non supportato: .${ext}`);
}

