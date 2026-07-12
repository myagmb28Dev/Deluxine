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
import type {
  PoseEditorState,
  PoseGuideResponse,
  PoseTopologyResponse,
  RenderModelId,
  RenderModelListResponse,
  RenderHistoryItem,
  RenderUsageResponse,
  SessionListItem,
} from './types/api';
import { AnimatePresence, motion } from 'framer-motion';
import {
  isRenderUsageExhausted,
  normalizeApiMessage,
  selectCatalogModel,
} from './lib/renderModel';
import { mergeRenderHistory, removeRenderHistoryItem } from './lib/renderHistory';

type SessionOverrides = Record<string, { title?: string; hidden?: boolean }>;
const SESSION_OVERRIDES_KEY = 'deluxine_session_overrides';

type SessionRenderJob = {
  jobId: string;
  startedAt: number;
};

type SessionRenderJobs = Record<string, SessionRenderJob | string>;
const SESSION_RENDER_JOBS_KEY = 'deluxine_session_render_jobs';
const RENDER_JOB_STALE_MS = 20 * 60 * 1000;
const RENDER_POLL_INTERVAL_MS = 3000;
const RENDER_POLL_TIMEOUT_MS = 10 * 60 * 1000;

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

const loadSessionRenderJobs = (): SessionRenderJobs => {
  try {
    const raw = localStorage.getItem(SESSION_RENDER_JOBS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SessionRenderJobs;
  } catch {
    return {};
  }
};

const saveSessionRenderJobs = (jobs: SessionRenderJobs) => {
  localStorage.setItem(SESSION_RENDER_JOBS_KEY, JSON.stringify(jobs));
};

const normalizeStoredRenderJob = (job: SessionRenderJob | string | undefined): SessionRenderJob | null => {
  if (!job) return null;
  if (typeof job === 'string') {
    return { jobId: job, startedAt: 0 };
  }
  if (!job.jobId) return null;
  return {
    jobId: job.jobId,
    startedAt: Number.isFinite(job.startedAt) ? job.startedAt : 0,
  };
};

const getLastRenderJob = (sessionId: string) => {
  const jobs = loadSessionRenderJobs();
  const job = normalizeStoredRenderJob(jobs[sessionId]);

  if (!job) return { job: null, wasStale: false };

  if (!job.startedAt || Date.now() - job.startedAt > RENDER_JOB_STALE_MS) {
    delete jobs[sessionId];
    saveSessionRenderJobs(jobs);
    return { job: null, wasStale: true };
  }

  return { job, wasStale: false };
};

const setLastRenderJob = (sessionId: string, jobId: string) => {
  const jobs = loadSessionRenderJobs();
  jobs[sessionId] = { jobId, startedAt: Date.now() };
  saveSessionRenderJobs(jobs);
};

const clearLastRenderJobId = (sessionId: string) => {
  const jobs = loadSessionRenderJobs();
  if (!(sessionId in jobs)) return;
  delete jobs[sessionId];
  saveSessionRenderJobs(jobs);
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

const getErrorMessage = (error: unknown, fallback: string) => {
  const maybeAxiosError = error as {
    message?: string;
    response?: {
      data?: unknown;
    };
  };
  const data = maybeAxiosError.response?.data;

  if (data && typeof data === 'object') {
    const body = data as { message?: unknown; error?: unknown; detail?: unknown };
    return normalizeApiMessage(body.message ?? body.error ?? body.detail, fallback);
  }

  if (typeof data === 'string' && data.trim()) return data;
  if (maybeAxiosError.message) return maybeAxiosError.message;
  return fallback;
};

const getRenderFailureMessage = (response: unknown, fallback: string) => {
  if (response && typeof response === 'object') {
    const body = response as { message?: unknown; error?: unknown; detail?: unknown };
    return normalizeApiMessage(body.message ?? body.error ?? body.detail, fallback);
  }
  return fallback;
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
  const [lineArtImage, setLineArtImage] = useState<string | null>(null);
  const [renderErrorMessage, setRenderErrorMessage] = useState<string | null>(null);
  const [renderModels, setRenderModels] = useState<RenderModelListResponse | null>(null);
  const [selectedModel, setSelectedModel] = useState<RenderModelId | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelErrorMessage, setModelErrorMessage] = useState<string | null>(null);
  const [renderUsage, setRenderUsage] = useState<RenderUsageResponse | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [usageErrorMessage, setUsageErrorMessage] = useState<string | null>(null);
  const [initialKps, setInitialKps] = useState<Keypoint[]>([]);
  const [initialEditorState, setInitialEditorState] = useState<PoseEditorState | null>(null);
  const [progress, setProgress] = useState(0);
  const [renderProgressMessage, setRenderProgressMessage] = useState<string | null>(null);
  const [poseTopology, setPoseTopology] = useState<PoseTopologyResponse | null>(null);
  const [poseGuide, setPoseGuide] = useState<PoseGuideResponse | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionListItem[]>([]);
  const [renderHistory, setRenderHistory] = useState<RenderHistoryItem[]>([]);
  const [renderHistoryCursor, setRenderHistoryCursor] = useState<string | null>(null);
  const [isLoadingRenderHistory, setIsLoadingRenderHistory] = useState(false);
  const [isLoadingMoreRenderHistory, setIsLoadingMoreRenderHistory] = useState(false);
  const [renderHistoryError, setRenderHistoryError] = useState<string | null>(null);
  const [deletingRenderJobId, setDeletingRenderJobId] = useState<string | null>(null);
  const [sessionOverrides, setSessionOverrides] = useState<SessionOverrides>(() => loadSessionOverrides());
  const eventSourceRef = useRef<EventSource | null>(null);
  const statusPollRef = useRef<number | null>(null);
  const renderPollRef = useRef<number | null>(null);
  const activeRenderJobRef = useRef<{ sessionId: string; jobId: string; startedAt: number } | null>(null);
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
    if (renderPollRef.current) {
      window.clearInterval(renderPollRef.current);
      renderPollRef.current = null;
    }
    activeRenderJobRef.current = null;
    setSessionId(null);
    setStatus('idle');
    setPrompt('');
    setLineArtImage(null);
    setRenderErrorMessage(null);
    setRenderModels(null);
    setSelectedModel(null);
    setIsLoadingModels(false);
    setModelErrorMessage(null);
    setRenderUsage(null);
    setIsLoadingUsage(false);
    setUsageErrorMessage(null);
    setInitialKps([]);
    setInitialEditorState(null);
    setProgress(0);
    setRenderProgressMessage(null);
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

  const stopRenderPolling = React.useCallback(() => {
    if (renderPollRef.current) {
      window.clearInterval(renderPollRef.current);
      renderPollRef.current = null;
    }
    activeRenderJobRef.current = null;
  }, []);

  const loadRenderModels = React.useCallback(async (sid: string) => {
    setIsLoadingModels(true);
    setModelErrorMessage(null);

    try {
      const catalog = await renderApi.getModels(sid);
      setRenderModels(catalog);
      setSelectedModel((current) => selectCatalogModel(catalog, current));
    } catch (error) {
      console.error('[App] Failed to load render models:', error);
      setRenderModels(null);
      setSelectedModel(null);
      setModelErrorMessage(getErrorMessage(error, '렌더링 모델 목록을 불러오지 못했습니다. 다시 시도해 주세요.'));
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  const loadRenderHistory = React.useCallback(async (cursor?: string) => {
    const append = Boolean(cursor);
    if (append) {
      setIsLoadingMoreRenderHistory(true);
    } else {
      setIsLoadingRenderHistory(true);
      setRenderHistoryError(null);
    }

    try {
      const response = await renderApi.getHistory({ limit: 20, ...(cursor ? { cursor } : {}) });
      setRenderHistory((current) => append ? mergeRenderHistory(current, response.items) : response.items);
      setRenderHistoryCursor(response.next_cursor);
    } catch (error) {
      console.error('[App] Failed to load render history:', error);
      setRenderHistoryError(getErrorMessage(error, '렌더 기록을 불러오지 못했습니다. 다시 시도해 주세요.'));
      if (!append) {
        setRenderHistory([]);
        setRenderHistoryCursor(null);
      }
    } finally {
      setIsLoadingRenderHistory(false);
      setIsLoadingMoreRenderHistory(false);
    }
  }, []);

  const deleteRenderHistoryItem = React.useCallback(async (jobId: string) => {
    setDeletingRenderJobId(jobId);
    setRenderHistoryError(null);
    try {
      await renderApi.deleteHistoryItem(jobId);
      setRenderHistory((current) => removeRenderHistoryItem(current, jobId));
    } catch (error) {
      console.error('[App] Failed to delete render history item:', error);
      setRenderHistoryError(getErrorMessage(error, '렌더 결과를 삭제하지 못했습니다. 다시 시도해 주세요.'));
    } finally {
      setDeletingRenderJobId(null);
    }
  }, []);

  React.useEffect(() => {
    if (!isLoggedIn) {
      setRenderHistory([]);
      setRenderHistoryCursor(null);
      setRenderHistoryError(null);
      return;
    }
    void loadRenderHistory();
  }, [isLoggedIn, loadRenderHistory]);

  const loadRenderUsage = React.useCallback(async (sid: string) => {
    setIsLoadingUsage(true);
    setUsageErrorMessage(null);

    try {
      const usage = await renderApi.getUsage(sid);
      setRenderUsage(usage);
      return usage;
    } catch (error) {
      console.error('[App] Failed to load render usage:', error);
      setRenderUsage(null);
      setUsageErrorMessage(getErrorMessage(error, '렌더링 사용량을 불러오지 못했습니다. 다시 시도해 주세요.'));
      return null;
    } finally {
      setIsLoadingUsage(false);
    }
  }, []);

  React.useEffect(() => {
    if (!sessionId || !isLoggedIn) {
      setRenderModels(null);
      setSelectedModel(null);
      setModelErrorMessage(null);
      return;
    }

    let cancelled = false;
    setIsLoadingModels(true);
    setRenderModels(null);
    setSelectedModel(null);
    setModelErrorMessage(null);

    renderApi.getModels(sessionId)
      .then((catalog) => {
        if (cancelled) return;
        setRenderModels(catalog);
        setSelectedModel((current) => selectCatalogModel(catalog, current));
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[App] Failed to load render models:', error);
        setRenderModels(null);
        setSelectedModel(null);
        setModelErrorMessage(getErrorMessage(error, '렌더링 모델 목록을 불러오지 못했습니다. 다시 시도해 주세요.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingModels(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, sessionId]);

  React.useEffect(() => {
    if (!sessionId || !isLoggedIn) {
      setRenderUsage(null);
      setUsageErrorMessage(null);
      return;
    }

    void loadRenderUsage(sessionId);
  }, [isLoggedIn, loadRenderUsage, sessionId]);

  const pollRenderStatus = React.useCallback((sid: string, jid: string, startedAt = Date.now()) => {
    stopRenderPolling();
    activeRenderJobRef.current = { sessionId: sid, jobId: jid, startedAt };

    const pollOnce = async () => {
      const activeJob = activeRenderJobRef.current;
      if (!activeJob || activeJob.sessionId !== sid || activeJob.jobId !== jid) return;

      if (Date.now() - activeJob.startedAt > RENDER_POLL_TIMEOUT_MS) {
        console.error('[App] Render job timed out:', { sessionId: sid, jobId: jid });
        clearLastRenderJobId(sid);
        setProgress(-1);
        setRenderErrorMessage(`렌더링 결과가 제한 시간 안에 도착하지 않았습니다. 서버에서 job_id를 확인해 주세요: ${jid}`);
        setStatus('failed');
        stopRenderPolling();
        return;
      }

      try {
        const res = await renderApi.getJobStatus(sid, jid);
        const stillActive = activeRenderJobRef.current;
        if (!stillActive || stillActive.sessionId !== sid || stillActive.jobId !== jid) return;

        console.info('[App] Render job status:', {
          sessionId: sid,
          jobId: jid,
          status: res.status,
          progress: res.progress,
          phase: res.phase,
        });
        setProgress(res.progress);
        setRenderProgressMessage(res.progress_message);

        if (res.status === 'completed') {
          if (!res.output_image) {
            clearLastRenderJobId(sid);
            setProgress(-1);
            setRenderErrorMessage('렌더링은 완료되었지만 결과 이미지를 받지 못했습니다. 다시 시도해 주세요.');
            setStatus('failed');
            stopRenderPolling();
            return;
          }
          setStatus('completed');
          stopRenderPolling();
          void loadRenderHistory();
        } else if (res.status === 'quota_exceeded') {
          clearLastRenderJobId(sid);
          console.warn('[App] Render quota exceeded:', res);
          setRenderErrorMessage('무료 이미지 생성 공통 한도에 도달했거나 현재 제공자가 혼잡합니다. 잠시 후 또는 한도 갱신 후 다시 시도해 주세요.');
          setStatus('failed');
          stopRenderPolling();
        } else if (res.status === 'failed') {
          clearLastRenderJobId(sid);
          console.warn('[App] Render job failed:', res);
          setRenderErrorMessage(getRenderFailureMessage(res, '렌더링 중 오류가 발생했습니다. 다시 시도해 주세요.'));
          setStatus('failed');
          stopRenderPolling();
        } else {
          setStatus('rendering');
        }
      } catch (err) {
        console.error('[App] Failed to poll render job status:', err);
        clearLastRenderJobId(sid);
        setRenderErrorMessage(getErrorMessage(err, '렌더링 상태를 확인하지 못했습니다. 네트워크 또는 서버 상태를 확인해 주세요.'));
        setStatus('failed');
        stopRenderPolling();
      }
    };

    void pollOnce();
    renderPollRef.current = window.setInterval(() => {
      void pollOnce();
    }, RENDER_POLL_INTERVAL_MS);
  }, [loadRenderHistory, stopRenderPolling]);

  const subscribeToSessionEvents = React.useCallback((sid: string) => {
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
          const legacyPose = pose as typeof pose & { points?: Keypoint[] };
          applyLoadedPose({
            keypoints: pose.keypoints || legacyPose.points || [],
            editorState: pose.editorState ?? null,
          });
          stopStatusPolling();
        }

        if (data.status === 'failed') {
          eventSource.close();
          eventSourceRef.current = null;
          console.warn('[SSE] Pose analysis failed:', data);
          setRenderErrorMessage(getRenderFailureMessage(data, '포즈 분석에 실패했습니다. 이미지를 확인한 뒤 다시 시도해 주세요.'));
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
  }, [applyLoadedPose, startStatusPolling, stopStatusPolling]);

  const restoreSession = React.useCallback(async (targetSessionId: string) => {
    if (!isLoggedIn) return;

    try {
      const session = await sessionApi.getById(targetSessionId);
      setSessionId(session.id);
      setLineArtImage(resolveAssetUrl(session.lineArtUrl));
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
      } catch {
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

      const { job: lastRenderJob, wasStale } = getLastRenderJob(session.id);
      if (wasStale) {
        console.warn('[App] Cleared stale render job while restoring session:', { sessionId: session.id });
        setRenderErrorMessage('이전에 시작된 렌더링 작업이 너무 오래 응답하지 않아 초기화했습니다. 다시 요청해 주세요.');
        setStatus('failed');
      }

      if (lastRenderJob) {
        try {
          const res = await renderApi.getJobStatus(session.id, lastRenderJob.jobId);
          console.info('[App] Restored render job status:', {
            sessionId: session.id,
            jobId: lastRenderJob.jobId,
            status: res.status,
            progress: res.progress,
            phase: res.phase,
          });
          setProgress(res.progress);
          setRenderProgressMessage(res.progress_message);
          if (res.status === 'completed') {
            if (res.output_image) {
              setStatus('completed');
            } else {
              clearLastRenderJobId(session.id);
              setProgress(-1);
              setRenderErrorMessage('렌더링은 완료되었지만 결과 이미지를 받지 못했습니다. 다시 시도해 주세요.');
              setStatus('failed');
            }
          } else if (res.status === 'quota_exceeded') {
            clearLastRenderJobId(session.id);
            console.warn('[App] Render quota exceeded while restoring job:', res);
            setRenderErrorMessage('무료 이미지 생성 공통 한도에 도달했거나 현재 제공자가 혼잡합니다. 잠시 후 또는 한도 갱신 후 다시 시도해 주세요.');
            setStatus('failed');
          } else if (res.status === 'failed') {
            clearLastRenderJobId(session.id);
            console.warn('[App] Render job failed while restoring:', res);
            setRenderErrorMessage(getRenderFailureMessage(res, '렌더링 중 오류가 발생했습니다. 다시 시도해 주세요.'));
            setStatus('failed');
          } else {
            setStatus('rendering');
            pollRenderStatus(session.id, lastRenderJob.jobId, lastRenderJob.startedAt);
          }
        } catch (err) {
          console.warn('[App] Failed to restore render job status:', err);
          clearLastRenderJobId(session.id);
          setRenderErrorMessage(getErrorMessage(err, '이전 렌더링 작업 상태를 복구하지 못했습니다. 다시 요청해 주세요.'));
          setStatus('failed');
        }
      }
    } catch (sessionError) {
      console.warn('Failed to restore session:', sessionError);
      resetWorkspace();
    }
  }, [applyLoadedPose, isLoggedIn, pollRenderStatus, resetWorkspace, startStatusPolling, subscribeToSessionEvents]);

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

    clearLastRenderJobId(id);

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
    } catch (error) {
      console.error('[App] Failed to create session:', error);
      setRenderErrorMessage(getErrorMessage(error, '이미지 업로드에 실패했습니다. 다시 시도해 주세요.'));
      setStatus('idle');
    }
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
      if (renderPollRef.current) {
        window.clearInterval(renderPollRef.current);
        renderPollRef.current = null;
      }
      activeRenderJobRef.current = null;
    };
  }, []);

  const handleRender = async () => {
    if (!sessionId || !isLoggedIn || !selectedModel) return;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    stopStatusPolling();
    stopRenderPolling();
    
    // UI 상태를 즉시 'rendering'으로 전환하여 버튼 비활성화 및 로딩 표시
    setProgress(0);
    setRenderProgressMessage('렌더링 작업을 요청하고 있습니다.');
    setStatus('rendering');
    setRenderErrorMessage(null);
    
    try {
      // Step 1: 현재 캔버스의 최종 포즈 데이터를 서버에 저장
      console.log('[App] Saving final pose before rendering...');
      await poseApi.update(sessionId, toApiKeypoints(keypoints), latestEditorStateRef.current ?? undefined);

      const poseProjectionCapture = await canvasEditorRef.current?.capturePoseProjection();
      if (!poseProjectionCapture?.imageData) {
        throw new Error('현재 마네킹 포즈 이미지를 캡처하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
      console.info('[App] Pose projection captured:', {
        mimeType: poseProjectionCapture.imageData.match(/^data:([^;,]+)/)?.[1] ?? 'unknown',
        characters: poseProjectionCapture.imageData.length,
        cameraView: poseProjectionCapture.cameraView,
      });
      
      // Step 2: 렌더링(이미지 생성) 요청
      console.log('[App] Requesting render with prompt:', prompt);
      const job = await renderApi.request(sessionId, {
        model: selectedModel,
        prompt: prompt || '',
        poseProjectionImage: poseProjectionCapture.imageData,
        ...(poseProjectionCapture.cameraView
          ? { cameraView: poseProjectionCapture.cameraView }
          : {}),
      });
      console.info('[App] Render job created:', {
        sessionId,
        jobId: job.job_id,
        status: job.status,
        model: job.model,
      });
      await loadRenderUsage(sessionId);
      setLastRenderJob(sessionId, job.job_id);
      pollRenderStatus(sessionId, job.job_id);
    } catch (err) {
      console.error('[App] Unified action failed:', err);
      clearLastRenderJobId(sessionId);
      const httpStatus = (err as { response?: { status?: number } }).response?.status;
      if (httpStatus === 429) {
        await loadRenderUsage(sessionId);
        setRenderErrorMessage('오늘 사용할 수 있는 이미지 생성을 모두 사용했어요. UTC 00:00에 다시 사용할 수 있습니다.');
      } else {
        setRenderErrorMessage(getErrorMessage(err, '렌더 요청에 실패했습니다. 다시 시도해 주세요.'));
      }
      setStatus('failed');
    }
  };


  if (isAuthLoading) return <div className="h-screen w-full bg-black flex items-center justify-center text-zinc-500 font-mono tracking-widest uppercase">Initializing...</div>;
  if (!isLoggedIn) return <LoginView onLogin={login} />;

  const shouldShowPromptBar = true;

  return (
    <div className="flex h-screen w-full bg-black text-white overflow-hidden font-sans selection:bg-white/10">
      <Sidebar 
        status={status}
        progress={progress}
        progressMessage={renderProgressMessage}
        sessionId={sessionId}
        user={user}
        onLogout={logout}
        recentSessions={sessionPanelItems}
        renderHistory={renderHistory}
        renderHistoryCursor={renderHistoryCursor}
        isLoadingRenderHistory={isLoadingRenderHistory}
        isLoadingMoreRenderHistory={isLoadingMoreRenderHistory}
        renderHistoryError={renderHistoryError}
        deletingRenderJobId={deletingRenderJobId}
        onReloadRenderHistory={() => void loadRenderHistory()}
        onLoadMoreRenderHistory={() => {
          if (renderHistoryCursor) void loadRenderHistory(renderHistoryCursor);
        }}
        onRenderHistorySelect={(item) => setSearchParams({ sessionId: item.session_id })}
        onDeleteRenderHistory={(jobId) => void deleteRenderHistoryItem(jobId)}
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
              sessionId={sessionId}
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
        
        {shouldShowPromptBar && (
          <PromptBar 
            prompt={prompt}
            onPromptChange={setPrompt}
            onRender={handleRender}
            isLoading={status === 'rendering' || status === 'analyzing'}
            errorMessage={renderErrorMessage}
            statusMessage={status === 'rendering'
              ? `${renderModels?.models.find((model) => model.id === selectedModel)?.name ?? '선택한 모델'}로 이미지를 생성하고 있습니다.`
              : null}
            onFileSelect={startSession}
            models={renderModels?.models ?? []}
            usage={renderUsage}
            isLoadingUsage={isLoadingUsage}
            usageErrorMessage={usageErrorMessage}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            isLoadingModels={isLoadingModels}
            modelErrorMessage={modelErrorMessage}
            onRetryModels={() => sessionId && void loadRenderModels(sessionId)}
            onRetryUsage={() => sessionId && void loadRenderUsage(sessionId)}
            isRenderDisabled={
              !selectedModel
              || isLoadingModels
              || isLoadingUsage
              || Boolean(modelErrorMessage)
              || Boolean(usageErrorMessage)
              || isRenderUsageExhausted(renderUsage?.daily ?? null)
            }
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
