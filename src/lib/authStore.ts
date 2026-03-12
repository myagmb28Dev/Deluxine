import type { AuthStore, GoogleCallbackResponse, RefreshTokenResponse } from '../types/api';

const AUTH_STORAGE_KEY = 'deluxine_auth';
export const AUTH_CHANGED_EVENT = 'deluxine:auth-changed';

const emitAuthChanged = () => {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
};

export const getAuthStore = (): AuthStore | null => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthStore;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
};

export const setAuthStore = (data: AuthStore) => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
  localStorage.setItem('deluxine_token', data.accessToken);
  emitAuthChanged();
};

export const clearAuthStore = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem('deluxine_token');
  emitAuthChanged();
};

export const saveFromGoogleCallbackResponse = (payload: GoogleCallbackResponse) => {
  setAuthStore({
    userId: payload.user_id,
    accessToken: payload.app_tokens.access_token,
    refreshToken: payload.app_tokens.refresh_token,
    email: payload.email,
  });
};

export const saveFromRefreshResponse = (payload: RefreshTokenResponse) => {
  const current = getAuthStore();
  if (!current) return;

  setAuthStore({
    userId: payload.user_id,
    accessToken: payload.app_tokens.access_token,
    refreshToken: payload.app_tokens.refresh_token,
    email: payload.email || current.email,
  });
};

export const parseCallbackQueryParams = (
  accessToken: string | null,
  refreshToken: string | null,
  userId: string | null,
  email: string | null,
): AuthStore | null => {
  if (!accessToken || !refreshToken || !userId) return null;

  const store: AuthStore = {
    userId,
    accessToken,
    refreshToken,
    email: email || '',
  };

  setAuthStore(store);
  return store;
};
