export type { Keypoint } from './api';
export type PipelineStatus = 'idle' | 'analyzing' | 'editing' | 'rendering' | 'completed' | 'failed' | 'pending';
export interface Session { id: string; lineArtUrl: string; status: string; }
