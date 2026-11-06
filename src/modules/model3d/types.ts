import type * as THREE from "three";

export type Model3dStats = {
  vertexCount: number;
  triangleCount: number;
  meshCount: number;
  animationCount: number;
  materialCount: number;
};

export type ModelLoadResult = {
  scene: THREE.Group | THREE.Object3D;
  animations: THREE.AnimationClip[];
  stats: Model3dStats;
};

export type AnimationPlaybackState = {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  loop: boolean;
  activeClipIndex: number;
};

export const SUPPORTED_3D_EXTENSIONS = [
  "glb",
  "gltf",
  "fbx",
  "obj",
  "stl",
  "bbmodel",
] as const;

export type Supported3dExtension = (typeof SUPPORTED_3D_EXTENSIONS)[number];

export function is3dExtension(ext: string): ext is Supported3dExtension {
  return SUPPORTED_3D_EXTENSIONS.includes(ext.toLowerCase() as Supported3dExtension);
}

