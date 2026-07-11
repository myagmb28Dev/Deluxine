import { useState, useEffect } from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { shouldFallbackToRedirect } from '../lib/authPopup';
import { authApi } from '../api/client';
import type { MeResponse } from '../types/api';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void getRedirectResult(auth).catch((error) => {
      console.error('Redirect login failed:', error);
    });

    // Firebase의 상태 감시자 설정
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // 로그인 상태일 때
        setUser(firebaseUser);

        // 백엔드와 동기화 (필요한 경우)
        try {
          const response = await authApi.getMe();
          setDbUser(response);
        } catch (e) {
          console.error('Backend sync failed:', e);
        }
      } else {
        // 로그아웃 상태일 때
        setUser(null);
        setDbUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      setIsLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      if (shouldFallbackToRedirect(error)) {
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectError) {
          console.error('Redirect login failed:', redirectError);
          setIsLoading(false);
        }
        return;
      }

      console.error('Login failed:', error);
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await signOut(auth);
      // 백엔드 로그아웃 API가 있다면 호출 (선택 사항)
      if (user) {
        try {
          await authApi.logout(user.uid);
        } catch (logoutError) {
          console.warn('Backend logout failed:', logoutError);
        }
      }
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoading(false);
      window.location.reload();
    }
  };

  return {
    isLoggedIn: !!user,
    user: dbUser || (user ? { user_id: user.uid, email: user.email, display_name: user.displayName, picture: user.photoURL } : null),
    isLoading,
    login,
    logout
  };
};
