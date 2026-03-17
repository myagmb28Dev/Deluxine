export interface Keypoint {
  name: string;
  x: number; // 3D 공간의 X (좌우)
  y: number; // 3D 공간의 Y (상하)
  z?: number; // 3D 공간의 Z (깊이 - 카메라와의 거리)
  confidence: number;
}

export interface PoseCandidate {
  id: string;
  label: string;
  keypoints: Keypoint[];
}

export interface SessionHistoryItem {
  timestamp: string;
  action: string;
  payload?: Record<string, unknown>;
}
