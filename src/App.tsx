import React, { useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { PromptBar } from './components/layout/PromptBar';
import { CanvasEditor, type CanvasEditorHandle } from './components/editor/CanvasEditor';
import { LoginView } from './components/auth/LoginView';
import { usePoseEditor } from './hooks/usePoseEditor';
import { useAuth } from './hooks/useAuth';
import { sessionApi, poseApi, renderApi } from './api/client';
import type { PipelineStatus, Keypoint } from './types';
import type { PoseEditorState, PoseGuideResponse, PoseTopologyResponse, SessionListItem } from './types/api';
import { AnimatePresence, motion } from 'framer-motion';

type SessionOverrides = Record<string, { title?: string; hidden?: boolean }>;
const SESSION_OVERRIDES_KEY = 'deluxine_session_overrides';

const loadSessionOverrides = (): SessionOverrides => {
  try {
    const raw = localStorage.getItem(SESSION_OVERRIDES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SessionOverrides;
  } catch {
    return {};
  }
};

const saveSessionOverrides = (overrides: SessionOverrides) => {
  localStorage.setItem(SESSION_OVERRIDES_KEY, JSON.stringify(overrides));
};

// Backend uses normalized coordinates (0.0 ~ 1.0)
const toDisplayKeypoints = (kps: Keypoint[]) => {
  return kps.map((kp) => ({
    ...kp,
    x: kp.x,
    y: kp.y,
    z: kp.z ?? 0,
    confidence: kp.confidence ?? 1.0
  }));
};

const toApiKeypoints = (kps: Keypoint[]) => {
  // 백엔드 가이드 v3.0에 따라 0.0 ~ 1.0 정규화 좌표를 그대로 전달
  return kps;
};

const resolveAssetUrl = (url: string | null) => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url;
};

const toKstDisplayTimestamp = (isoLike: string) => {
  const parsed = new Date(isoLike);
  if (Number.isNaN(parsed.getTime())) {
    return isoLike;
  }

  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return formatter.format(parsed).replace(' ', 'T') + '+09:00';
};

const AppContent: React.FC = () => {
  const { isLoggedIn, user, login, logout, isLoading: isAuthLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [prompt, setPrompt] = useState('');
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [lineArtImage, setLineArtImage] = useState<string | null>(null);
  const [renderErrorMessage, setRenderErrorMessage] = useState<string | null>(null);
  const [initialKps, setInitialKps] = useState<Keypoint[]>([]);
  const [initialEditorState, setInitialEditorState] = useState<PoseEditorState | null>(null);
  const [progress, setProgress] = useState(0);
  const [poseTopology, setPoseTopology] = useState<PoseTopologyResponse | null>(null);
  const [poseGuide, setPoseGuide] = useState<PoseGuideResponse | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionListItem[]>([]);
  const [sessionOverrides, setSessionOverrides] = useState<SessionOverrides>(() => loadSessionOverrides());
  const eventSourceRef = useRef<EventSource | null>(null);
  const statusPollRef = useRef<number | null>(null);
  const canvasEditorRef = useRef<CanvasEditorHandle | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingPoseRef = useRef<Keypoint[] | null>(null);
  const latestEditorStateRef = useRef<PoseEditorState | null>(null);
  const lastSavedPoseSignatureRef = useRef<string | null>(null);

  const sessionPanelItems = React.useMemo(
    () => recentSessions
      .map((session, index) => {
        const override = sessionOverrides[session.id];
        if (override?.hidden) return null;
        return {
          ...session,
          title: override?.title || session.title || `세션 ${index + 1}`,
        } as SessionListItem;
      })
      .filter(Boolean) as SessionListItem[],
    [recentSessions, sessionOverrides],
  );

  // usePoseEditor에 전달할 콜백을 메모이제이션하여 불필요한 재생성 방지
  const handlePoseUpdate = React.useCallback((kps: Keypoint[]) => {
    if (!sessionId) return;

    const payload = {
      keypoints: toApiKeypoints(kps),
      editorState: latestEditorStateRef.current ?? null,
    };
    const signature = JSON.stringify(payload);
    if (lastSavedPoseSignatureRef.current === signature) {
      return;
    }

    pendingPoseRef.current = payload.keypoints;

    const flushPoseSave = async () => {
      if (saveInFlightRef.current || !pendingPoseRef.current) return;

      const nextPayload = pendingPoseRef.current;
      const nextEditorState = latestEditorStateRef.current ?? null;
      const nextSignature = JSON.stringify({
        keypoints: nextPayload,
        editorState: nextEditorState,
      });
      if (lastSavedPoseSignatureRef.current === nextSignature) {
        pendingPoseRef.current = null;
        return;
      }

      saveInFlightRef.current = true;
      pendingPoseRef.current = null;

      try {
        await poseApi.update(sessionId, nextPayload, nextEditorState);
        lastSavedPoseSignatureRef.current = nextSignature;
      } catch (error) {
        console.warn('[App] pose sync failed:', error);
        pendingPoseRef.current = nextPayload;
      } finally {
        saveInFlightRef.current = false;
        if (pendingPoseRef.current) {
          void flushPoseSave();
        }
      }
    };

    void flushPoseSave();
  }, [sessionId]);

  const { keypoints, handleUpdateKeypoint3D } = usePoseEditor(
    initialKps,
    handlePoseUpdate
  );

  const resetWorkspace = React.useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (statusPollRef.current) {
      window.clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
    setSessionId(null);
    setStatus('idle');
    setPrompt('');
    setFinalImage(null);
    setLineArtImage(null);
    setRenderErrorMessage(null);
    setInitialKps([]);
    setInitialEditorState(null);
    setProgress(0);
    setPoseTopology(null);
    setPoseGuide(null);
    pendingPoseRef.current = null;
    latestEditorStateRef.current = null;
    lastSavedPoseSignatureRef.current = null;
    saveInFlightRef.current = false;
  }, []);

  const applyLoadedPose = React.useCallback((pose: { keypoints?: Keypoint[]; editorState?: PoseEditorState | null } | null) => {
    const rawKeypoints = pose?.keypoints || [];
    const converted = toDisplayKeypoints(rawKeypoints as Keypoint[]);
    const loadedEditorState = pose?.editorState ?? null;
    latestEditorStateRef.current = loadedEditorState;
    setInitialEditorState(loadedEditorState);
    lastSavedPoseSignatureRef.current = JSON.stringify({
      keypoints: toApiKeypoints(converted),
      editorState: loadedEditorState,
    });
    pendingPoseRef.current = null;
    setInitialKps(converted);
    setProgress(100);
    setStatus('editing');
  }, []);

  const stopStatusPolling = React.useCallback(() => {
    if (statusPollRef.current) {
      window.clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  }, []);

  const startStatusPolling = React.useCallback((sid: string) => {
    stopStatusPolling();
    statusPollRef.current = window.setInterval(async () => {
      try {
        const poseStatus = await poseApi.getStatus(sid);
        if (poseStatus.status === 'pending' || poseStatus.status === 'generating') {
          setProgress(poseStatus.progress || 0);
          setStatus('analyzing');
          return;
        }

        if (poseStatus.status === 'completed') {
          const pose = await poseApi.getById(poseStatus.pose_id);
          applyLoadedPose(pose as { keypoints?: Keypoint[] });
          stopStatusPolling();
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          return;
        }

        if (poseStatus.status === 'failed') {
          setStatus('failed');
          stopStatusPolling();
        }
      } catch {
        // keep polling; transient network errors should not force a hard failure
      }
    }, 1500);
  }, [applyLoadedPose, stopStatusPolling]);

  const restoreSession = React.useCallback(async (targetSessionId: string) => {
    if (!isLoggedIn) return;

    try {
      const session = await sessionApi.getById(targetSessionId);
      setSessionId(session.id);
      setLineArtImage(resolveAssetUrl(session.lineArtUrl));
      setFinalImage(null);
      setRenderErrorMessage(null);
      setPrompt('');
      setProgress(0);

      // Load topology & guide
      try {
        const [topology, guide] = await Promise.all([
          poseApi.getTopology(session.id),
          poseApi.getGuide(session.id)
        ]);
        setPoseTopology(topology);
        setPoseGuide(guide);
      } catch (err) {
        console.warn('Failed to load pose metadata:', err);
      }

      try {
        const pose = await poseApi.getCurrent(session.id);
        console.log('[App] Current Pose Data:', pose);
        applyLoadedPose(pose as { keypoints?: Keypoint[] });
      } catch (err) {
        console.warn('[App] No current pose found, checking status...');
        try {
          const poseStatus = await poseApi.getStatus(session.id);
          if (poseStatus.status === 'generating' || poseStatus.status === 'pending') {
            setInitialKps([]);
            setInitialEditorState(null);
            setProgress(poseStatus.progress || 0);
            setStatus('analyzing');
            subscribeToSessionEvents(session.id);
            startStatusPolling(session.id);
          } else if (poseStatus.status === 'completed') {
            const pose = await poseApi.getById(poseStatus.pose_id);
            applyLoadedPose(pose as { keypoints?: Keypoint[] });
          } else {
            setInitialKps([]);
            setInitialEditorState(null);
            setStatus('idle');
          }
        } catch (innerErr) {
          console.error('[App] Failed to load pose status:', innerErr);
          setInitialKps([]);
          setInitialEditorState(null);
          setStatus('idle');
        }
      }
    } catch (sessionError) {
      console.warn('Failed to restore session:', sessionError);
      resetWorkspace();
    }
  }, [applyLoadedPose, isLoggedIn, resetWorkspace, startStatusPolling]);

  // Load session list when logged in
  React.useEffect(() => {
    if (isLoggedIn && !isAuthLoading) {
      sessionApi.list({ limit: 5, sort: 'updatedAt:desc' }).then((response) => setRecentSessions(response.items)).catch(err => {
        console.warn('Failed to load session list:', err);
      });
    }
  }, [isLoggedIn, isAuthLoading]);

  const renameSession = React.useCallback((id: string, title: string) => {
    setSessionOverrides((prev) => {
      const next = { ...prev, [id]: { ...(prev[id] || {}), title } };
      saveSessionOverrides(next);
      return next;
    });
    sessionApi.update(id, { title })
      .then((updated) => {
        setRecentSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
      })
      .catch((err) => {
        console.warn('[Deluxine] session rename server sync failed:', err);
      });
  }, []);

  const deleteSessionFromPanel = React.useCallback((id: string) => {
    setSessionOverrides((prev) => {
      const next = { ...prev, [id]: { ...(prev[id] || {}), hidden: true } };
      saveSessionOverrides(next);
      return next;
    });

    if (sessionId === id) {
      setSearchParams({});
      resetWorkspace();
    }

    sessionApi.delete(id)
      .then(() => {
        setRecentSessions((prev) => prev.filter((s) => s.id !== id));
      })
      .catch((err) => {
        console.warn('[Deluxine] session delete server sync failed:', err);
      });
  }, [resetWorkspace, sessionId, setSearchParams]);

  React.useEffect(() => {
    const requestedSessionId = searchParams.get('sessionId');

    if (!isLoggedIn || isAuthLoading) return;

    if (!requestedSessionId) {
      return;
    }

    if (requestedSessionId === sessionId) {
      return;
    }

    restoreSession(requestedSessionId);
  }, [isLoggedIn, isAuthLoading, restoreSession, searchParams, sessionId]);

  const startSession = async (file: File) => {
    if (!isLoggedIn) {
      setStatus('idle');
      return;
    }

    try {
      setProgress(0);
      setStatus('analyzing');
      setFinalImage(null);
      setRenderErrorMessage(null);
      setInitialKps([]);
      setInitialEditorState(null);
      latestEditorStateRef.current = null;
      lastSavedPoseSignatureRef.current = null;
      const session = await sessionApi.create(file);
      
      // 새 세션을 최근 목록에 즉시 추가 (KST 강제 보정)
      const nowKst = toKstDisplayTimestamp(new Date().toISOString());
      const newSessionItem: SessionListItem = { 
        id: session.id, 
        title: session.title || '새 세션', 
        createdAt: session.createdAt ? toKstDisplayTimestamp(session.createdAt) : nowKst, 
        updatedAt: session.updatedAt ? toKstDisplayTimestamp(session.updatedAt) : nowKst
      };

      setRecentSessions((prev) => [newSessionItem, ...prev].slice(0, 5));

      setSessionId(session.id);
      setSearchParams({ sessionId: session.id });
      setLineArtImage(resolveAssetUrl(session.lineArtUrl));
      
      // Load topology & guide
      try {
        const [topology, guide] = await Promise.all([
          poseApi.getTopology(session.id),
          poseApi.getGuide(session.id)
        ]);
        setPoseTopology(topology);
        setPoseGuide(guide);
      } catch (err) {
        console.warn('Failed to load metadata:', err);
      }
      
      subscribeToSessionEvents(session.id);
      startStatusPolling(session.id);
    } catch (err) { 
      setStatus('idle'); 
    }
  };

  const subscribeToSessionEvents = (sid: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    console.log(`[SSE] Subscribing: ${sid}`);
    const eventSource = new EventSource(`/sessions/${sid}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === 'pending' || data.status === 'generating') {
          setProgress(data.progress || 0);
          setStatus('analyzing');
        }

        if (data.status === 'completed') {
          if (!data.pose_id) {
            console.warn('[SSE] Completed event received without pose_id');
            return;
          }

          // 중복 전송 방지를 위해 즉시 닫기
          eventSource.close();
          eventSourceRef.current = null;
          console.log('[SSE] Completed. Fetching final pose...');

          const pose = await poseApi.getById(data.pose_id);
          applyLoadedPose({
            keypoints: (pose.keypoints || (pose as any).points || []) as Keypoint[],
            editorState: pose.editorState ?? null,
          });
          stopStatusPolling();
        }

        if (data.status === 'failed') {
          eventSource.close();
          eventSourceRef.current = null;
          setStatus('failed');
          stopStatusPolling();
        }
      } catch (err) {
        console.error('[SSE] Message error:', err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
      startStatusPolling(sid);
    };
    return () => eventSource.close();
  };

  React.useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (statusPollRef.current) {
        window.clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
    };
  }, []);

  const handleRender = async () => {
    if (!sessionId || !isLoggedIn) return;
    
    // UI 상태를 즉시 'rendering'으로 전환하여 버튼 비활성화 및 로딩 표시
    setProgress(0);
    setStatus('rendering');
    setRenderErrorMessage(null);
    
    try {
      // Step 1: 현재 캔버스의 최종 포즈 데이터를 서버에 저장
      console.log('[App] Saving final pose before rendering...');
      await poseApi.update(sessionId, toApiKeypoints(keypoints), latestEditorStateRef.current ?? undefined);

      const poseProjectionImage = await canvasEditorRef.current?.capturePoseProjection();
      
      // Step 2: 렌더링(이미지 생성) 요청
      console.log('[App] Requesting render with prompt:', prompt);
      const job = await renderApi.request(sessionId, prompt || "", poseProjectionImage || undefined);
      pollRenderStatus(sessionId, job.job_id);
    } catch (err) {
      console.error('[App] Unified action failed:', err);
      setStatus('editing'); 
    }
  };

  const pollRenderStatus = (sid: string, jid: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await renderApi.getJobStatus(sid, jid);
        if (res.status === 'completed') {
          setFinalImage(resolveAssetUrl(res.output_image));
          setProgress(100);
          setStatus('completed');
          clearInterval(interval);
        } else if (res.status === 'quota_exceeded') {
          setProgress(-1);
          setRenderErrorMessage('렌더링 쿼터를 초과했습니다. 잠시 후 다시 시도해주세요.');
          setStatus('failed');
          clearInterval(interval);
        } else if (res.status === 'failed') {
          setProgress(-1);
          setRenderErrorMessage('렌더링 중 오류가 발생했습니다. 다시 시도해주세요.');
          setStatus('failed');
          clearInterval(interval);
        } else {
          // pending or in_progress status
          setProgress(res.progress || 0);
        }
      } catch (err) {
        setStatus('failed');
        clearInterval(interval);
      }
    }, 3000);
  };

  if (isAuthLoading) return <div className="h-screen w-full bg-black flex items-center justify-center text-zinc-500 font-mono tracking-widest uppercase">Initializing...</div>;
  if (!isLoggedIn) return <LoginView onLogin={login} />;

  return (
    <div className="flex h-screen w-full bg-black text-white overflow-hidden font-sans selection:bg-white/10">
      <Sidebar 
        status={status}
        progress={progress}
        sessionId={sessionId}
        onFileSelect={startSession}
        finalImage={finalImage}
        user={user}
        onLogout={logout}
        recentSessions={sessionPanelItems}
        onSessionSelect={(id) => setSearchParams({ sessionId: id })}
        onNewSession={() => {
          setSearchParams({});
          resetWorkspace();
        }}
        onRenameSession={renameSession}
        onDeleteSession={deleteSessionFromPanel}
      />
      <main className="flex-1 relative flex flex-col items-center bg-[#050505] overflow-hidden">
        <div className="w-full flex-1 overflow-y-auto flex flex-col items-center p-20 pt-32">
          <motion.div layout className="relative">
            <CanvasEditor 
              ref={canvasEditorRef}
              key={sessionId || 'idle'}
              keypoints={keypoints}
              backgroundImage={lineArtImage}
              topology={poseTopology}
              guide={poseGuide}
              initialEditorState={initialEditorState}
              onUpdateKeypoint={handleUpdateKeypoint3D}
              onEditorStateChange={(editorState) => {
                latestEditorStateRef.current = editorState;
              }}
            />
            <AnimatePresence>
              {status === 'idle' && (
                <motion.div exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-2xl border border-dashed border-zinc-800">
                  <div className="text-zinc-500 text-[10px] font-bold tracking-[0.2em] uppercase">Upload Line Art to Start</div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
        
        {(status === 'editing' || status === 'rendering' || status === 'completed') && (
          <PromptBar 
            prompt={prompt}
            onPromptChange={setPrompt}
            onRender={handleRender}
            isLoading={status === 'rendering'}
            errorMessage={renderErrorMessage}
          />
        )}
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppContent />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
