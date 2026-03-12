import { useState, useEffect } from 'react';
import { authApi } from '../api/client';
import { AUTH_CHANGED_EVENT, clearAuthStore, getAuthStore } from '../lib/authStore';

export const useAuth = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      const auth = getAuthStore();
      if (!auth?.accessToken) {
        if (isMounted) {
          setIsLoggedIn(false);
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      if (isMounted) {
        setIsLoggedIn(true);
        setUser({ user_id: auth.userId, email: auth.email || null });
      }

      try {
        const userData = await authApi.getMe();
        if (isMounted) {
          setUser(userData);
          setIsLoggedIn(true);
        }
      } catch {
        const latestAuth = getAuthStore();
        if (!latestAuth?.accessToken && isMounted) {
          setIsLoggedIn(false);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    const syncAuthState = () => {
      const auth = getAuthStore();
      if (!auth?.accessToken) {
        setIsLoggedIn(false);
        setUser(null);
        setIsLoading(false);
        return;
      }

      setIsLoggedIn(true);
      setUser((currentUser: any) => currentUser ?? { user_id: auth.userId, email: auth.email || null });
      setIsLoading(false);
    };

    checkAuth();

    window.addEventListener(AUTH_CHANGED_EVENT, syncAuthState);

    return () => {
      isMounted = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, syncAuthState);
    };
  }, []);

  const login = () => {
    window.location.href = authApi.getGoogleLoginUrl();
  };

  const logout = async () => {
    if (user) {
      try { await authApi.logout(user.user_id || user.id); } catch (e) {}
    }
    clearAuthStore();
    setIsLoggedIn(false);
    setUser(null);
    window.location.reload();
  };

  return { isLoggedIn, user, isLoading, login, logout };
};
