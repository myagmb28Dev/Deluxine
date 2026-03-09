export interface Keypoint {
  name: string;
  x: number;
  y: number;
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
