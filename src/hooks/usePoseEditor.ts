import { useState, useCallback, useEffect, useRef } from 'react';
import type { Keypoint } from '../types';
import * as THREE from 'three';

export const usePoseEditor = (initialKeypoints: Keypoint[], onUpdate: (kps: Keypoint[]) => void) => {
  const [keypoints, setKeypoints] = useState<Keypoint[]>(initialKeypoints);
  const saveTimeoutRef = useRef<number | null>(null);

  // 외부 데이터(initialKeypoints)가 들어오면 내부 상태를 즉시 동기화
  useEffect(() => {
    setKeypoints(initialKeypoints || []);
  }, [initialKeypoints]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  // 3D 공간에서 전달된 변경된 위치(Vector3)를 정규화 좌표(0~1)로 복원하여 저장
  // isFinal이 true일 때만 서버 업데이트(onUpdate)를 트리거하여 네트워크 부하 최적화
  const handleUpdateKeypoint3D = useCallback((index: number, newPos: THREE.Vector3, isFinal: boolean) => {
    setKeypoints(prev => {
      const next = [...prev];
      if (!next[index]) return prev;

      // CanvasEditor에서의 변환 로직을 역산
      // worldX = (x - 0.5) * 6  =>  x = (worldX / 6) + 0.5
      // worldY = -(y - 0.5) * 8 =>  y = -(worldY / 8) + 0.5
      const updatedKp = {
        ...next[index],
        x: (newPos.x / 6) + 0.5,
        y: -(newPos.y / 8) + 0.5,
        z: (newPos.z / 0.8)
      };
      
      next[index] = updatedKp;

      // 같은 조작 종료 안에서 여러 관절이 순차 갱신돼도 서버 저장은 1회로 합친다.
      if (isFinal) {
        if (saveTimeoutRef.current) {
          window.clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = window.setTimeout(() => {
          onUpdate(next);
          saveTimeoutRef.current = null;
        }, 0);
      }
      
      return next;
    });
  }, [onUpdate]);

  return { keypoints, handleUpdateKeypoint3D };
};
