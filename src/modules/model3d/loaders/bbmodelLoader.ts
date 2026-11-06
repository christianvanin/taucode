import * as THREE from "three";
import type { ModelLoadResult, Model3dStats } from "../types";

export function parseBBModel(jsonString: string): Promise<ModelLoadResult> {
  return new Promise((resolve, reject) => {
    try {
      const data = JSON.parse(jsonString);
      const sceneGroup = new THREE.Group();
      sceneGroup.name = data.name || "BlockbenchModel";

      const resWidth = data.resolution?.width || 64;
      const resHeight = data.resolution?.height || 64;

      // 1. Carica le texture (data URL base64)
      const textureMap = new Map<string, THREE.Texture>();
      const materialsMap = new Map<string, THREE.Material>();

      const defaultMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.8,
        metalness: 0.1,
      });

      if (Array.isArray(data.textures)) {
        for (let i = 0; i < data.textures.length; i++) {
          const texData = data.textures[i];
          const texKey = String(texData.id ?? i);
          if (texData.source && typeof texData.source === "string") {
            const img = new Image();
            img.src = texData.source;
            const texture = new THREE.Texture(img);
            img.onload = () => {
              texture.needsUpdate = true;
            };
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.colorSpace = THREE.SRGBColorSpace;
            textureMap.set(texKey, texture);

            const mat = new THREE.MeshStandardMaterial({
              map: texture,
              transparent: true,
              alphaTest: 0.1,
              roughness: 0.85,
              metalness: 0.05,
              side: THREE.DoubleSide,
            });
            materialsMap.set(texKey, mat);
          }
        }
      }

      // Helper per applicare le coordinate UV di Blockbench a un BoxGeometry
      const applyBoxUVs = (
        geo: THREE.BoxGeometry,
        faces: any,
        resW: number,
        resH: number,
      ) => {
        const uvAttr = geo.attributes.uv;
        // Ordine facce Three.js: +X (0,1), -X (2,3), +Y (4,5), -Y (6,7), +Z (8,9), -Z (10,11)
        const faceKeys = ["east", "west", "up", "down", "south", "north"];

        for (let i = 0; i < 6; i++) {
          const fKey = faceKeys[i];
          const face = faces ? faces[fKey] : null;
          
          if (face && Array.isArray(face.uv) && face.uv.length === 4) {
            let [u1, v1, u2, v2] = face.uv;
            // Normalizza 0-1
            const nu1 = u1 / resW;
            const nv1 = 1 - v1 / resH;
            const nu2 = u2 / resW;
            const nv2 = 1 - v2 / resH;

            // Coordinate UV per i 4 vertici della faccia
            uvAttr.setXY(i * 4 + 0, nu1, nv1);
            uvAttr.setXY(i * 4 + 1, nu2, nv1);
            uvAttr.setXY(i * 4 + 2, nu1, nv2);
            uvAttr.setXY(i * 4 + 3, nu2, nv2);
          }
        }
        uvAttr.needsUpdate = true;
      };

      const elementMeshes = new Map<string, THREE.Object3D>();
      let totalVertices = 0;
      let totalTriangles = 0;
      let meshCount = 0;

      // 2. Costruisci le geometrie dei cubi
      if (Array.isArray(data.elements)) {
        for (const el of data.elements) {
          if (!el.from || !el.to) continue;

          const dx = Math.abs(el.to[0] - el.from[0]) || 0.001;
          const dy = Math.abs(el.to[1] - el.from[1]) || 0.001;
          const dz = Math.abs(el.to[2] - el.from[2]) || 0.001;

          const geometry = new THREE.BoxGeometry(dx, dy, dz);
          applyBoxUVs(geometry, el.faces, resWidth, resHeight);

          // Trova il materiale associato
          let mat: THREE.Material = defaultMaterial;
          if (el.faces) {
            for (const f of Object.values(el.faces) as any[]) {
              if (f && f.texture != null) {
                const found = materialsMap.get(String(f.texture));
                if (found) {
                  mat = found;
                  break;
                }
              }
            }
          }

          const mesh = new THREE.Mesh(geometry, mat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.name = el.name || "cube";

          // Pivot & Posizionamento
          const centerX = (el.from[0] + el.to[0]) / 2;
          const centerY = (el.from[1] + el.to[1]) / 2;
          const centerZ = (el.from[2] + el.to[2]) / 2;

          const pivotX = el.origin ? el.origin[0] : centerX;
          const pivotY = el.origin ? el.origin[1] : centerY;
          const pivotZ = el.origin ? el.origin[2] : centerZ;

          // Se l'elemento ha una rotazione propria, crea un gruppo pivot
          if (el.rotation && (el.rotation[0] || el.rotation[1] || el.rotation[2])) {
            const pivotGroup = new THREE.Group();
            pivotGroup.name = `${el.name}_pivot`;
            pivotGroup.position.set(pivotX, pivotY, pivotZ);

            mesh.position.set(centerX - pivotX, centerY - pivotY, centerZ - pivotZ);

            pivotGroup.rotation.set(
              THREE.MathUtils.degToRad(el.rotation[0] || 0),
              THREE.MathUtils.degToRad(el.rotation[1] || 0),
              THREE.MathUtils.degToRad(el.rotation[2] || 0),
            );
            pivotGroup.add(mesh);
            elementMeshes.set(el.uuid || String(meshCount), pivotGroup);
          } else {
            mesh.position.set(centerX, centerY, centerZ);
            elementMeshes.set(el.uuid || String(meshCount), mesh);
          }

          meshCount++;
          totalVertices += 24;
          totalTriangles += 12;
        }
      }

      // 3. Costruisci la gerarchia dell'outliner (ossa / cartelle)
      const bonesMap = new Map<string, THREE.Group>();

      const buildOutlinerNode = (node: any): THREE.Object3D | null => {
        if (typeof node === "string") {
          // Riferimento a un cubo element
          const mesh = elementMeshes.get(node);
          if (mesh) {
            elementMeshes.delete(node); // marcato come assegnato
            return mesh;
          }
          return null;
        }

        if (typeof node === "object" && node.name) {
          const bone = new THREE.Group();
          bone.name = node.name;
          const origin = node.origin || [0, 0, 0];
          bone.position.set(origin[0], origin[1], origin[2]);

          if (node.rotation) {
            bone.rotation.set(
              THREE.MathUtils.degToRad(node.rotation[0] || 0),
              THREE.MathUtils.degToRad(node.rotation[1] || 0),
              THREE.MathUtils.degToRad(node.rotation[2] || 0),
            );
          }

          if (node.uuid) {
            bonesMap.set(node.uuid, bone);
          }
          bonesMap.set(node.name, bone);

          if (Array.isArray(node.children)) {
            for (const child of node.children) {
              const childObj = buildOutlinerNode(child);
              if (childObj) {
                // Riassegna la posizione locale rispetto al parent bone
                childObj.position.x -= origin[0];
                childObj.position.y -= origin[1];
                childObj.position.z -= origin[2];
                bone.add(childObj);
              }
            }
          }
          return bone;
        }
        return null;
      };

      if (Array.isArray(data.outliner) && data.outliner.length > 0) {
        for (const rootNode of data.outliner) {
          const node = buildOutlinerNode(rootNode);
          if (node) sceneGroup.add(node);
        }
      }

      // Aggiungi eventuali elementi sciolti non referenziati nell'outliner
      for (const unassigned of elementMeshes.values()) {
        sceneGroup.add(unassigned);
      }

      // Normalizza la scala: in Minecraft 16 unità = 1 metro. Scaliamo a 1/16 per compatibilità standard
      sceneGroup.scale.set(1 / 16, 1 / 16, 1 / 16);

      // 4. Converti le animazioni di Blockbench in THREE.AnimationClip
      const animations: THREE.AnimationClip[] = [];

      if (Array.isArray(data.animations)) {
        for (const animData of data.animations) {
          const tracks: THREE.KeyframeTrack[] = [];
          const animDuration = animData.length || 1;

          if (animData.animators) {
            for (const [animatorId, animator] of Object.entries<any>(animData.animators)) {
              const targetNode = bonesMap.get(animatorId) || bonesMap.get(animator.name);
              if (!targetNode) continue;
              const trackTargetName = targetNode.name;

              // Rotazioni
              const rotKeyframes = (animator.keyframes || []).filter(
                (k: any) => k.channel === "rotation",
              );
              if (rotKeyframes.length > 0) {
                const times: number[] = [];
                const values: number[] = [];
                for (const k of rotKeyframes) {
                  times.push(k.time);
                  const dp = k.data_points?.[0] || { x: 0, y: 0, z: 0 };
                  const euler = new THREE.Euler(
                    THREE.MathUtils.degToRad(Number(dp.x) || 0),
                    THREE.MathUtils.degToRad(Number(dp.y) || 0),
                    THREE.MathUtils.degToRad(Number(dp.z) || 0),
                  );
                  const q = new THREE.Quaternion().setFromEuler(euler);
                  values.push(q.x, q.y, q.z, q.w);
                }
                tracks.push(
                  new THREE.QuaternionKeyframeTrack(`${trackTargetName}.quaternion`, times, values),
                );
              }

              // Posizioni
              const posKeyframes = (animator.keyframes || []).filter(
                (k: any) => k.channel === "position",
              );
              if (posKeyframes.length > 0) {
                const times: number[] = [];
                const values: number[] = [];
                for (const k of posKeyframes) {
                  times.push(k.time);
                  const dp = k.data_points?.[0] || { x: 0, y: 0, z: 0 };
                  values.push(Number(dp.x) || 0, Number(dp.y) || 0, Number(dp.z) || 0);
                }
                tracks.push(
                  new THREE.VectorKeyframeTrack(`${trackTargetName}.position`, times, values),
                );
              }
            }
          }

          if (tracks.length > 0) {
            const clip = new THREE.AnimationClip(animData.name || "animation", animDuration, tracks);
            animations.push(clip);
          }
        }
      }

      const stats: Model3dStats = {
        vertexCount: totalVertices,
        triangleCount: totalTriangles,
        meshCount,
        animationCount: animations.length,
        materialCount: materialsMap.size || 1,
      };

      resolve({
        scene: sceneGroup,
        animations,
        stats,
      });
    } catch (err) {
      reject(new Error(`Errore durante il parsing di Blockbench: ${err}`));
    }
  });
}
