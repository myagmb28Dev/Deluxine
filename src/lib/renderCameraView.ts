import * as THREE from 'three';
import type { RenderCameraView } from '../types/api';

const RAD_TO_DEG = 180 / Math.PI;
const MIN_CAMERA_DISTANCE = 1e-6;

export const calculateRenderCameraView = (
  camera: THREE.Camera,
  target: THREE.Vector3,
): RenderCameraView | null => {
  const offset = camera.position.clone().sub(target);
  const horizontalDistance = Math.hypot(offset.x, offset.z);
  const distance = offset.length();

  if (!Number.isFinite(distance) || distance < MIN_CAMERA_DISTANCE) {
    return null;
  }

  const azimuthDegrees = Math.atan2(offset.x, offset.z) * RAD_TO_DEG;
  const elevationDegrees =
    Math.atan2(offset.y, horizontalDistance) * RAD_TO_DEG;

  return {
    azimuthDegrees: Number(azimuthDegrees.toFixed(2)),
    elevationDegrees: Number(elevationDegrees.toFixed(2)),
  };
};
