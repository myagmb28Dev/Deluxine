export type ApiError = {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string;
};

export type HistoryItem = {
  timestamp: string;
  action: string;
  payload?: Record<string, unknown>;
};

export type SessionDto = {
  id: string;
  title?: string | null;
  lineArtUrl: string;
  history: HistoryItem[];
  createdAt: string;
  updatedAt: string;
};

export type Keypoint = {
  name: string;
  x: number;
  y: number;
  z?: number;
  confidence?: number;
};

export type PoseEditorTransform = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
};

export type PoseEditorState = {
  version: string;
  wholeTransform: PoseEditorTransform;
  bones: Record<string, { quaternion: [number, number, number, number] }>;
};

export type PoseDto = {
  id: string;
  sessionId: string;
  coordinateMode?: 'normalized' | 'pixel';
  label: string;
  keypoints: Array<Keypoint & { confidence: number }>;
  editorState?: PoseEditorState | null;
  isChosen: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PoseStatusResponse =
  | { status: 'pending' | 'generating'; progress: number; phase: 'processing' }
  | { status: 'failed'; progress: -1; phase: 'failed' }
  | { status: 'completed'; pose_id: string; progress: 100; phase: 'editing' };

export type UpdatePoseRequest = {
  keypoints: Array<{
    name: string;
    x: number;
    y: number;
  }>;
  editorState?: PoseEditorState;
};

export type UpdateSessionRequest = {
  title?: string;
};

export type CreateRenderRequest = {
  prompt: string;
  poseProjectionImage?: string;
};

export type CreateRenderResponse = {
  job_id: string;
  status: 'pending';
  message: string;
  line_art: string;
  chosen_pose: string;
  prompt_used: string;
  history: HistoryItem[];
};

export type RenderJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'quota_exceeded';

export type RenderJobResponse = {
  job_id: string;
  status: RenderJobStatus;
  output_image: string | null;
  created_at: string;
  updated_at: string;
  progress?: number;
};

export type MeResponse = {
  user_id: string;
  google_id: string;
  email: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  picture: string | null;
  created_at: string;
  updated_at: string;
};

export type PoseGuideJoint = {
  name: string;
  label: string;
  group:
    | 'head'
    | 'face'
    | 'torso'
    | 'left_arm'
    | 'right_arm'
    | 'left_leg'
    | 'right_leg'
    | 'left_hand'
    | 'right_hand'
    | 'left_foot'
    | 'right_foot';
  color: string;
};

export type PoseGuideResponse = {
  joints: PoseGuideJoint[];
};

export type PoseTopologyResponse = {
  edges: [string, string][];
  left_right_pairs: [string, string][];
  groups: {
    head?: string[];
    face?: string[];
    torso?: string[];
    arm?: string[];
    hand?: string[];
    leg?: string[];
    [key: string]: string[] | undefined;
  };
};

export type SessionListItem = {
  id: string;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionListQuery = {
  limit?: number;
  sort?: 'updatedAt:desc' | 'updatedAt:asc' | 'createdAt:desc' | 'createdAt:asc';
  q?: string;
  cursor?: string;
};

export type SessionListResponse = {
  items: SessionListItem[];
  nextCursor: string | null;
  total: number;
};

