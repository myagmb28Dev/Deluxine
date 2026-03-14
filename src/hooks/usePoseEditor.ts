import { useState, useCallback, useEffect, useRef } from 'react';
import type { Keypoint } from '../types';

type DragTarget =
  | { type: 'joint'; index: number }
  | { type: 'group'; indices: number[] }
  | { type: 'global' };

type DragState = {
  target: DragTarget;
  anchor: { x: number; y: number };
  initialKeypoints: Keypoint[];
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const usePoseEditor = (initialKeypoints: Keypoint[], onUpdate: (kps: Keypoint[]) => void) => {
  const [keypoints, setKeypoints] = useState<Keypoint[]>(initialKeypoints);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const keypointsRef = useRef<Keypoint[]>(initialKeypoints);
  const hasPendingChangesRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);

  useEffect(() => {
    setKeypoints(initialKeypoints);
    keypointsRef.current = initialKeypoints;
    hasPendingChangesRef.current = false;
  }, [initialKeypoints]);

  useEffect(() => {
    keypointsRef.current = keypoints;
  }, [keypoints]);

  const handleStart = useCallback((x: number, y: number, target?: DragTarget) => {
    const resolvedTarget = target ?? (() => {
      const idx = keypoints.findIndex(kp => Math.hypot(kp.x - x, kp.y - y) < 0.05);
      return idx !== -1 ? { type: 'joint', index: idx } as DragTarget : null;
    })();

    if (!resolvedTarget) return;

    dragStateRef.current = {
      target: resolvedTarget,
      anchor: { x, y },
      initialKeypoints: keypoints,
    };

    if (resolvedTarget.type === 'joint') {
      setDraggingIdx(resolvedTarget.index);
    } else {
      setDraggingIdx(null);
    }
  }, [keypoints]);

  const handleMove = useCallback((x: number, y: number) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    const newKps = [...dragState.initialKeypoints];

    if (dragState.target.type === 'joint') {
      const targetIndex = dragState.target.index;
      newKps[targetIndex] = {
        ...newKps[targetIndex],
        x: clamp01(x),
        y: clamp01(y),
      };
    } else {
      const deltaX = x - dragState.anchor.x;
      const deltaY = y - dragState.anchor.y;
      
      if (dragState.target.type === 'global') {
        dragState.initialKeypoints.forEach((_, index) => {
          newKps[index] = {
            ...dragState.initialKeypoints[index],
            x: clamp01(dragState.initialKeypoints[index].x + deltaX),
            y: clamp01(dragState.initialKeypoints[index].y + deltaY),
          };
        });
      } else {
        dragState.target.indices.forEach((index) => {
          newKps[index] = {
            ...newKps[index],
            x: clamp01(dragState.initialKeypoints[index].x + deltaX),
            y: clamp01(dragState.initialKeypoints[index].y + deltaY),
          };
        });
      }
    }

    setKeypoints(newKps);
    keypointsRef.current = newKps;
    hasPendingChangesRef.current = true;
  }, []);

  const scaleAll = useCallback((factor: number) => {
    if (keypoints.length === 0) return;
    
    // Find center of all keypoints
    const centerX = keypoints.reduce((sum, kp) => sum + kp.x, 0) / keypoints.length;
    const centerY = keypoints.reduce((sum, kp) => sum + kp.y, 0) / keypoints.length;

    const newKps = keypoints.map(kp => ({
      ...kp,
      x: clamp01(centerX + (kp.x - centerX) * factor),
      y: clamp01(centerY + (kp.y - centerY) * factor),
    }));

    setKeypoints(newKps);
    onUpdate(newKps);
  }, [keypoints, onUpdate]);

  const handleEnd = useCallback(() => {
    if (dragStateRef.current && hasPendingChangesRef.current) {
      onUpdate(keypointsRef.current);
      hasPendingChangesRef.current = false;
    }
    dragStateRef.current = null;
    setDraggingIdx(null);
  }, [onUpdate]);

  return { keypoints, draggingIdx, handleStart, handleMove, handleEnd, scaleAll };
};
