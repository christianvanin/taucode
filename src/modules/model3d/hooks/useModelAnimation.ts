import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

interface UseModelAnimationProps {
  modelRoot: THREE.Group | null;
  animations: THREE.AnimationClip[];
}

export function useModelAnimation({ modelRoot, animations }: UseModelAnimationProps) {
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const rafIdRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [loop, setLoop] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Inizializza mixer e azioni quando il modello o le animazioni cambiano
  useEffect(() => {
    if (!modelRoot || animations.length === 0) {
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }
      activeActionRef.current = null;
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const mixer = new THREE.AnimationMixer(modelRoot);
    mixerRef.current = mixer;

    const clipIdx = Math.min(activeClipIndex, animations.length - 1);
    const clip = animations[clipIdx] || animations[0];
    setDuration(clip.duration);

    const action = mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.setEffectiveTimeScale(speed);
    if (isPlaying) {
      action.play();
    }
    activeActionRef.current = action;

    clockRef.current.start();

    const tick = () => {
      rafIdRef.current = requestAnimationFrame(tick);
      if (mixerRef.current) {
        const delta = clockRef.current.getDelta();
        if (isPlaying) {
          mixerRef.current.update(delta);
        }
        if (activeActionRef.current) {
          const t = activeActionRef.current.time;
          const dur = activeActionRef.current.getClip().duration || 1;
          const normalized = t % dur;
          setCurrentTime(normalized);
        }
      }
    };
    tick();

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      mixer.stopAllAction();
    };
  }, [modelRoot, animations, activeClipIndex, loop, speed, isPlaying]);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (activeActionRef.current) {
        activeActionRef.current.paused = !next;
      }
      return next;
    });
  }, []);

  const seek = useCallback((time: number) => {
    setCurrentTime(time);
    if (activeActionRef.current) {
      activeActionRef.current.time = time;
      if (mixerRef.current) {
        mixerRef.current.update(0);
      }
    }
  }, []);

  const selectClip = useCallback(
    (index: number) => {
      if (index < 0 || index >= animations.length) return;
      setActiveClipIndex(index);
      const clip = animations[index];
      setDuration(clip.duration);
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        const nextAction = mixerRef.current.clipAction(clip);
        nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        nextAction.setEffectiveTimeScale(speed);
        if (isPlaying) nextAction.play();
        activeActionRef.current = nextAction;
      }
    },
    [animations, loop, speed, isPlaying],
  );

  const cycleSpeed = useCallback(() => {
    const speeds = [0.5, 1.0, 1.5, 2.0];
    setSpeed((curr) => {
      const nextIdx = (speeds.indexOf(curr) + 1) % speeds.length;
      const next = speeds[nextIdx];
      if (activeActionRef.current) {
        activeActionRef.current.setEffectiveTimeScale(next);
      }
      return next;
    });
  }, []);

  const toggleLoop = useCallback(() => {
    setLoop((prev) => {
      const next = !prev;
      if (activeActionRef.current) {
        activeActionRef.current.setLoop(next ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        activeActionRef.current.clampWhenFinished = !next;
      }
      return next;
    });
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    speed,
    loop,
    activeClipIndex,
    togglePlay,
    seek,
    selectClip,
    cycleSpeed,
    toggleLoop,
  };
}

