import axios from 'axios';
import { clearAuthStore, getAuthStore, saveFromRefreshResponse } from '../lib/authStore';
import type {
  CreateRenderResponse,
  MeResponse,
  PoseDto,
  PoseGenerateResponse,
  PoseGuideResponse,
  PoseTopologyResponse,
  PoseStatusResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  RenderJobResponse,
  SessionDto,
  SessionListQuery,
  SessionListResponse,
  SessionListItem,
  Keypoint,
} from '../types/api';

const api = axios.create({
  baseURL: '/',
  headers: { 'Content-Type': 'application/json' },
});

const authlessApi = axios.create({
  baseURL: '/',
  headers: { 'Content-Type': 'application/json' },
});

const isLoginPage = () => {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/';
};

const redirectToLogin = () => {
  if (typeof window === 'undefined') return;
  clearAuthStore();
  if (!isLoginPage()) {
    window.location.replace('/');
    return;
  }
  window.dispatchEvent(new Event('deluxine:auth-changed'));
};

const clearAuthAndRedirect = () => {
  redirectToLogin();
};

api.interceptors.request.use((config) => {
  const auth = getAuthStore();
  if (auth?.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  return config;
});

let refreshPromise: Promise<RefreshTokenResponse | null> | null = null;

const refreshAccessToken = async (): Promise<RefreshTokenResponse | null> => {
  const auth = getAuthStore();
  if (!auth?.userId || !auth?.refreshToken) {
    clearAuthAndRedirect();
    return null;
  }

  if (!refreshPromise) {
    const payload: RefreshTokenRequest = {
      user_id: auth.userId,
      refresh_token: auth.refreshToken,
    };

    refreshPromise = authlessApi
      .post<RefreshTokenResponse>('/auth/refresh', payload)
      .then((res) => {
        saveFromRefreshResponse(res.data);
        return res.data;
      })
      .catch(() => {
        clearAuthAndRedirect();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error?.response?.status;
    const auth = getAuthStore();
    const hasRefreshContext = !!auth?.userId && !!auth?.refreshToken;

    if (status !== 401) {
      return Promise.reject(error);
    }

    if (!hasRefreshContext) {
      clearAuthAndRedirect();
      return Promise.reject(error);
    }

    if (originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshed = await refreshAccessToken();
      if (refreshed?.app_tokens?.access_token) {
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${refreshed.app_tokens.access_token}`;
        return api(originalRequest);
      }
    }

    clearAuthAndRedirect();

    return Promise.reject(error);
  },
);

export const authApi = {
  getGoogleLoginUrl: () => '/auth/google',
  getMe: () => api.get<MeResponse>('/auth/me').then(res => res.data),
  refresh: (userId: string, refreshToken: string) => api.post<RefreshTokenResponse>('/auth/refresh', { user_id: userId, refresh_token: refreshToken }).then(res => res.data),
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
  generate: (sessionId: string) => api.post<PoseGenerateResponse>(`/sessions/${sessionId}/pose/generate`).then(res => res.data),
  getStatus: (sessionId: string) => api.get<PoseStatusResponse>(`/sessions/${sessionId}/pose/status`).then(res => res.data),
  getCurrent: (sessionId: string) => api.get<PoseDto>(`/sessions/${sessionId}/pose`).then(res => res.data),
  update: (sessionId: string, keypoints: Keypoint[]) => api.patch<PoseDto>(`/sessions/${sessionId}/pose`, { keypoints }).then(res => res.data),
  getGuide: (sessionId: string) => api.get<PoseGuideResponse>(`/sessions/${sessionId}/pose/guide`).then(res => res.data),
  getTopology: (sessionId: string) => api.get<PoseTopologyResponse>(`/sessions/${sessionId}/pose/topology`).then(res => res.data),
};

export const renderApi = {
  request: (sessionId: string, prompt: string) => api.post<CreateRenderResponse>(`/sessions/${sessionId}/render`, { prompt }).then(res => res.data),
  getJobStatus: (sessionId: string, jobId: string) => api.get<RenderJobResponse>(`/sessions/${sessionId}/render/jobs/${jobId}`).then(res => res.data),
};

export default api;
