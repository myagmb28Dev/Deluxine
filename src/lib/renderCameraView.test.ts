import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { calculateRenderCameraView } from './renderCameraView';

const cameraAt = (position: [number, number, number]) => {
  const camera = new THREE.OrthographicCamera();
  camera.position.set(...position);
  return camera;
};

describe('calculateRenderCameraView', () => {
  test('uses the default front camera as zero azimuth and elevation', () => {
    expect(
      calculateRenderCameraView(
        cameraAt([0, 0, 10]),
        new THREE.Vector3(0, 0, 0),
      ),
    ).toEqual({ azimuthDegrees: 0, elevationDegrees: 0 });
  });

  test('returns positive azimuth on the target right and negative on its left', () => {
    const target = new THREE.Vector3(0, 0, 0);

    expect(calculateRenderCameraView(cameraAt([10, 0, 0]), target)).toEqual({
      azimuthDegrees: 90,
      elevationDegrees: 0,
    });
    expect(calculateRenderCameraView(cameraAt([-10, 0, 0]), target)).toEqual({
      azimuthDegrees: -90,
      elevationDegrees: 0,
    });
  });

  test('returns positive elevation when the camera is above the target', () => {
    expect(
      calculateRenderCameraView(
        cameraAt([0, 10, 10]),
        new THREE.Vector3(0, 0, 0),
      ),
    ).toEqual({ azimuthDegrees: 0, elevationDegrees: 45 });
  });

  test('calculates angles relative to a non-origin target', () => {
    expect(
      calculateRenderCameraView(
        cameraAt([15, 4, -2]),
        new THREE.Vector3(5, 4, -2),
      ),
    ).toEqual({ azimuthDegrees: 90, elevationDegrees: 0 });
  });

  test('returns null when camera and target positions are identical', () => {
    expect(
      calculateRenderCameraView(
        cameraAt([1, 2, 3]),
        new THREE.Vector3(1, 2, 3),
      ),
    ).toBeNull();
  });

  test('returns null for a non-finite camera position', () => {
    expect(
      calculateRenderCameraView(
        cameraAt([Number.NaN, 0, 10]),
        new THREE.Vector3(0, 0, 0),
      ),
    ).toBeNull();
  });
});
