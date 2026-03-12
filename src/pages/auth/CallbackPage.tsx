import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setAuthStore } from '../../lib/authStore';
import { authApi } from '../../api/client';

const getCallbackParams = (searchParams: URLSearchParams) => {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  return {
    accessToken: searchParams.get('access_token') || hashParams.get('access_token'),
    refreshToken: searchParams.get('refresh_token') || hashParams.get('refresh_token'),
    userId: searchParams.get('user_id') || hashParams.get('user_id'),
    email: searchParams.get('email') || hashParams.get('email'),
  };
};

const CallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const processCallback = async () => {
      try {
        const { accessToken, refreshToken, userId, email } = getCallbackParams(searchParams);

        if (!accessToken || !refreshToken || !userId) {
          throw new Error('콜백 파라미터가 부족합니다.');
        }

        setAuthStore({
          userId,
          accessToken,
          refreshToken,
          email: email || '',
        });

        try {
          await authApi.getMe();
        } catch (meErr) {
          if (meErr instanceof Error) {
            console.warn('getMe validation warning (non-blocking):', meErr.message);
          }
        }

        setIsProcessing(false);
        navigate('/', { replace: true });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : '콜백 처리 중 오류가 발생했습니다.'
        );
        setIsProcessing(false);
      }
    };

    processCallback();
  }, [searchParams, navigate]);

  if (isProcessing) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-sm text-zinc-500 font-mono tracking-widest uppercase">
            로그인 처리 중...
          </div>
          <div className="mt-4 text-xs text-zinc-600">
            Google 인증이 완료되고 있습니다.
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center">
        <div className="text-white text-center max-w-md">
          <div className="text-red-400 text-sm font-mono mb-4">{error}</div>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="px-6 py-2 bg-white text-black rounded-lg font-semibold hover:bg-zinc-200 transition-all"
          >
            로그인 화면으로
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default CallbackPage;
