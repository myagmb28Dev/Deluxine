import { Pose } from '../../entities/pose.entity';
import { RenderModel } from './render-model';

export type RenderProgressPhase =
  | 'queued'
  | 'preparing'
  | 'generating'
  | 'uploading'
  | 'completed'
  | 'failed';

export interface RenderProgressSnapshot {
  progress: number;
  phase: RenderProgressPhase;
  message: string;
}

export type RenderPoseData = Pick<Pose, 'keypoints'> & Partial<Pose>;

export interface RenderCameraView {
  azimuthDegrees: number;
  elevationDegrees: number;
}

export interface RenderQueuePayload {
  jobId: string;
  sessionId: string;
  userId: string;
  lineArtKey: string;
  chosenPose: Pose;
  prompt: string;
  model?: RenderModel;
  poseProjectionImage?: string;
  cameraView?: RenderCameraView;
  usageDay?: string;
}

export interface CreateRenderJobInput extends Omit<
  RenderQueuePayload,
  'jobId' | 'model' | 'usageDay'
> {
  model: RenderModel;
  usageDay: string;
  history: Array<{ timestamp: string; action: string }>;
}
