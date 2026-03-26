import axios from 'axios';
import { auth } from '../lib/firebase';
import type {
  CreateRenderResponse,
  MeResponse,
  PoseDto,
  PoseGuideResponse,
  PoseTopologyResponse,
  PoseStatusResponse,
  RenderJobResponse,
  SessionDto,
  SessionListQuery,
  SessionListResponse,
  SessionListItem,
  Keypoint,
  PoseEditorState,
} from '../types/api';

const api = axios.create({
  baseURL: '/',
  headers: { 'Content-Type': 'application/json' },
});

// 요청 인터셉터: Firebase ID 토큰을 실시간으로 가져와서 헤더에 삽입
api.interceptors.request.use(async (config) => {
  const currentUser = auth.currentUser;
  if (currentUser) {
    // getIdToken(true)를 호출하면 필요시 자동으로 토큰이 갱신됩니다.
    const token = await currentUser.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 응답 인터셉터: 401 발생 시 로그아웃 처리 (혹은 간단한 알림)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      console.warn('Session expired or unauthorized');
      // Firebase가 알아서 상태를 관리하므로 별도의 토큰 갱신 로직은 필요 없습니다.
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  getMe: () => api.get<MeResponse>('/auth/me').then(res => res.data),
  logout: (userId: string) => api.post(`/auth/users/${userId}/logout`).then(res => res.data),
};

export const sessionApi = {
  create: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<SessionDto>('/sessions', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },
  getById: (id: string) => api.get<SessionDto>(`/sessions/${id}`).then(res => res.data),
  list: (query: SessionListQuery = { limit: 30 }) => api.get<SessionListResponse>('/sessions', { params: query }).then(res => res.data),
  update: (id: string, data: { title?: string }) => api.patch<SessionListItem>(`/sessions/${id}`, data).then(res => res.data),
  delete: (id: string) => api.delete<void>(`/sessions/${id}`).then(() => undefined),
};

export const poseApi = {
  getById: (poseId: string) => api.get<PoseDto>(`/poses/${poseId}`).then(res => res.data),
  getStatus: (sessionId: string) => api.get<PoseStatusResponse>(`/sessions/${sessionId}/pose/status`).then(res => res.data),
  getCurrent: (sessionId: string) => api.get<PoseDto>(`/sessions/${sessionId}/pose`).then(res => res.data),
  update: (sessionId: string, keypoints: Keypoint[], editorState?: PoseEditorState | null) =>
    api.patch<PoseDto>(`/sessions/${sessionId}/pose`, { keypoints, ...(editorState ? { editorState } : {}) }).then(res => res.data),
  getGuide: (sessionId: string) => api.get<PoseGuideResponse>(`/sessions/${sessionId}/pose/guide`).then(res => res.data),
  getTopology: (sessionId: string) => api.get<PoseTopologyResponse>(`/sessions/${sessionId}/pose/topology`).then(res => res.data),
};

export const renderApi = {
  request: (sessionId: string, prompt: string, poseProjectionImage?: string) =>
    api.post<CreateRenderResponse>(`/sessions/${sessionId}/render`, { prompt, poseProjectionImage }).then(res => res.data),
  getJobStatus: (sessionId: string, jobId: string) => api.get<RenderJobResponse>(`/sessions/${sessionId}/render/jobs/${jobId}`).then(res => res.data),
};

export default api;
