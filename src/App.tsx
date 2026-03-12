import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { PromptBar } from './components/layout/PromptBar';
import { CanvasEditor } from './components/editor/CanvasEditor';
import { LoginView } from './components/auth/LoginView';
import { ProgressBar } from './components/common/ProgressBar';
import CallbackPage from './pages/auth/CallbackPage';
import { usePoseEditor } from './hooks/usePoseEditor';
import { useAuth } from './hooks/useAuth';
import { sessionApi, poseApi, renderApi } from './api/client';
import { getAuthStore } from './lib/authStore';
import { refineKeypointsByLineArt } from './lib/keypointRefine';
import type { PipelineStatus, Keypoint } from './types';
import type { PoseGuideJoint, PoseTopologyResponse, SessionListItem } from './types/api';
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

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const toDisplayKeypoints = (kps: Keypoint[], coordinateMode?: 'normalized' | 'pixel') => {
  if (coordinateMode === 'normalized') {
    return {
      mode: 'normalized' as const,
      keypoints: kps.map((kp) => ({ ...kp, x: clamp01(kp.x), y: clamp01(kp.y) })),
    };
  }

  if (coordinateMode === 'pixel') {
    return {
      mode: 'pixel' as const,
      keypoints: kps.map((kp) => ({
        ...kp,
        x: clamp01(kp.x / CANVAS_WIDTH),
        y: clamp01(kp.y / CANVAS_HEIGHT),
      })),
    };
  }

  const isPixelBased = kps.some((kp) => kp.x > 1 || kp.y > 1);
  if (!isPixelBased) {
    return {
      mode: 'normalized' as const,
      keypoints: kps.map((kp) => ({ ...kp, x: clamp01(kp.x), y: clamp01(kp.y) })),
    };
  }
  return {
    mode: 'pixel' as const,
    keypoints: kps.map((kp) => ({
      ...kp,
      x: clamp01(kp.x / CANVAS_WIDTH),
      y: clamp01(kp.y / CANVAS_HEIGHT),
    })),
  };
};

const toApiKeypoints = (kps: Keypoint[], mode: 'normalized' | 'pixel') => {
  if (mode === 'normalized') return kps;
  return kps.map((kp) => ({
    ...kp,
    x: kp.x * CANVAS_WIDTH,
    y: kp.y * CANVAS_HEIGHT,
  }));
};

const resolveAssetUrl = (url: string | null) => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url;
};

const hasAuthSession = () => {
  const auth = getAuthStore();
  return !!auth?.accessToken;
};

const AppContent: React.FC = () => {
  const { isLoggedIn, user, login, logout, isLoading: isAuthLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [prompt, setPrompt] = useState('');
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [lineArtImage, setLineArtImage] = useState<string | null>(null);
  const [initialKps, setInitialKps] = useState<Keypoint[]>([]);
  const [poseCoordinateMode, setPoseCoordinateMode] = useState<'normalized' | 'pixel'>('normalized');
  const [progress, setProgress] = useState(0);
  const [jointGuides, setJointGuides] = useState<PoseGuideJoint[]>([]);
  const [poseTopology, setPoseTopology] = useState<PoseTopologyResponse | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionListItem[]>([]);
  const [sessionOverrides, setSessionOverrides] = useState<SessionOverrides>(() => loadSessionOverrides());
  const [isRefiningPose, setIsRefiningPose] = useState(false);

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

  const { keypoints, draggingIdx, handleStart, handleMove, handleEnd } = usePoseEditor(
    initialKps,
    (kps) => { if (sessionId) poseApi.update(sessionId, toApiKeypoints(kps, poseCoordinateMode)); }
  );

  const resetWorkspace = React.useCallback(() => {
    setSessionId(null);
    setStatus('idle');
    setPrompt('');
    setFinalImage(null);
    setLineArtImage(null);
    setInitialKps([]);
    setPoseCoordinateMode('normalized');
    setProgress(0);
    setJointGuides([]);
    setPoseTopology(null);
    setIsRefiningPose(false);
  }, []);

  const refineAndApplyKeypoints = React.useCallback(async (sourceKeypoints: Keypoint[]) => {
    if (!lineArtImage || sourceKeypoints.length === 0) return sourceKeypoints;

    setIsRefiningPose(true);
    try {
      const refined = await refineKeypointsByLineArt(lineArtImage, sourceKeypoints, CANVAS_WIDTH, CANVAS_HEIGHT, poseTopology || undefined);
      setInitialKps(refined);
      if (sessionId) {
        await poseApi.update(sessionId, toApiKeypoints(refined, poseCoordinateMode));
      }
      return refined;
    } finally {
      setIsRefiningPose(false);
    }
  }, [lineArtImage, poseCoordinateMode, poseTopology, sessionId]);

  const restoreSession = React.useCallback(async (targetSessionId: string) => {
    if (!hasAuthSession()) return;

    try {
      const session = await sessionApi.getById(targetSessionId);
      setSessionId(session.id);
      setLineArtImage(resolveAssetUrl(session.lineArtUrl));
      setFinalImage(null);
      setPrompt('');
      setProgress(0);

      try {
        const guide = await poseApi.getGuide(session.id);
        setJointGuides(guide.joints);
      } catch (guideError) {
        console.warn('Failed to load pose guide:', guideError);
        setJointGuides([]);
      }

      try {
        const topology = await poseApi.getTopology(session.id);
        setPoseTopology(topology);
      } catch (topologyError) {
        console.warn('Failed to load pose topology:', topologyError);
        setPoseTopology(null);
      }

      try {
        const pose = await poseApi.getCurrent(session.id);
        const converted = toDisplayKeypoints((pose.keypoints || []) as Keypoint[], pose.coordinateMode);
        setPoseCoordinateMode(converted.mode);
        const refined = await refineAndApplyKeypoints(converted.keypoints);
        setInitialKps(refined);
        setStatus('editing');
      } catch {
        try {
          const poseStatus = await poseApi.getStatus(session.id);
          if (poseStatus.status === 'generating' || poseStatus.status === 'pending') {
            setInitialKps([]);
            setProgress(poseStatus.progress || 0);
            setStatus('analyzing');
            pollPoseStatus(session.id);
          } else {
            setInitialKps([]);
            setStatus('idle');
          }
        } catch {
          setInitialKps([]);
          setStatus('idle');
        }
      }
    } catch (sessionError) {
      console.warn('Failed to restore session:', sessionError);
      resetWorkspace();
    }
  }, [resetWorkspace]);

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
    if (!hasAuthSession()) {
      setStatus('idle');
      return;
    }

    try {
      setProgress(0);
      setStatus('analyzing');
      setFinalImage(null);
      const session = await sessionApi.create(file);
      setSessionId(session.id);
      setSearchParams({ sessionId: session.id });
      setLineArtImage(resolveAssetUrl(session.lineArtUrl));
      
      // Load joint guides
      try {
        const guide = await poseApi.getGuide(session.id);
        setJointGuides(guide.joints);
      } catch (err) {
        console.warn('Failed to load pose guide:', err);
        setJointGuides([]);
      }

      // Load topology
      try {
        const topology = await poseApi.getTopology(session.id);
        setPoseTopology(topology);
      } catch (err) {
        console.warn('Failed to load pose topology:', err);
        setPoseTopology(null);
      }
      
      await poseApi.generate(session.id);
      pollPoseStatus(session.id);
    } catch (err) { 
      setStatus('idle'); 
    }
  };

  const pollPoseStatus = (sid: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await poseApi.getStatus(sid);
        if (res.status === 'completed') {
          const pose = await poseApi.getCurrent(sid);
          const converted = toDisplayKeypoints((pose.keypoints || []) as Keypoint[], pose.coordinateMode);
          setPoseCoordinateMode(converted.mode);
          const refined = await refineAndApplyKeypoints(converted.keypoints);
          setInitialKps(refined);
          setProgress(100);
          setStatus('editing');
          clearInterval(interval);
        } else if (res.status === 'failed') {
          setProgress(-1);
          setStatus('failed');
          clearInterval(interval);
        } else {
          // pending or generating status
          setProgress(res.progress || 0);
        }
      } catch (err) {
        setStatus('failed');
        clearInterval(interval);
      }
    }, 2000);
  };

  const handleRender = async () => {
    if (!sessionId || !prompt || !hasAuthSession()) return;
    setProgress(0);
    setStatus('rendering');
    try {
      const job = await renderApi.request(sessionId, prompt);
      pollRenderStatus(sessionId, job.job_id);
    } catch (err) { setStatus('editing'); }
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
        } else if (res.status === 'failed') {
          setProgress(-1);
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
      <main className="flex-1 relative flex flex-col items-center justify-center bg-[#050505] p-20">
        {(status === 'analyzing' || status === 'rendering') && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-24 w-80 px-6"
          >
            <ProgressBar progress={progress} status={status === 'analyzing' ? 'analyzing' : 'rendering'} />
          </motion.div>
        )}
        <motion.div layout className="relative">
          <CanvasEditor 
            keypoints={keypoints}
            backgroundImage={lineArtImage}
            jointGuides={jointGuides}
            topology={poseTopology}
            draggingIdx={draggingIdx}
            onStart={handleStart}
            onMove={handleMove}
            onEnd={handleEnd}
            isLoading={status === 'analyzing'}
            isRefining={isRefiningPose}
          />
          <AnimatePresence>
            {status === 'idle' && (
              <motion.div exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-2xl border border-dashed border-zinc-800">
                <div className="text-zinc-500 text-[10px] font-bold tracking-[0.2em] uppercase">Upload Line Art to Start</div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        {(status === 'editing' || status === 'rendering' || status === 'completed') && (
          <PromptBar 
            prompt={prompt}
            onPromptChange={setPrompt}
            onRender={handleRender}
            isLoading={status === 'rendering'}
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
        <Route path="/auth/callback" element={<CallbackPage />} />
        <Route path="/" element={<AppContent />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
