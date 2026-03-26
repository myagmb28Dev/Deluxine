import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Loader2, LogOut, User, Menu, FolderPlus } from 'lucide-react';
import { Badge } from '../ui';
import type { PipelineStatus } from '../../types';
import type { SessionListItem } from '../../types/api';

const formatKstLabel = (isoLike: string) => {
  const parsed = new Date(isoLike);
  if (Number.isNaN(parsed.getTime())) {
    return isoLike.replace('T', ' ').substring(0, 16);
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
};

interface SidebarProps {
  status: PipelineStatus;
  progress: number;
  sessionId: string | null;
  onFileSelect: (file: File) => void;
  finalImage?: string | null;
  user?: any;
  onLogout: () => void;
  recentSessions?: SessionListItem[];
  onSessionSelect?: (id: string) => void;
  onNewSession?: () => void;
  onRenameSession?: (id: string, title: string) => void;
  onDeleteSession?: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  status,
  progress,
  sessionId,
  onFileSelect,
  finalImage,
  user,
  onLogout,
  recentSessions,
  onSessionSelect,
  onNewSession,
  onRenameSession,
  onDeleteSession,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [menuState, setMenuState] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeSessionLabel = useMemo(() => {
    const activeSession = recentSessions?.find((session) => session.id === sessionId);
    return activeSession?.title || (sessionId ? `Session ${sessionId.slice(0, 8)}` : '새 세션');
  }, [recentSessions, sessionId]);

  useEffect(() => {
    if (!menuState) return;

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && menuRef.current.contains(target)) {
        return;
      }
      setMenuState(null);
    };
    window.addEventListener('mousedown', closeMenu);

    return () => {
      window.removeEventListener('mousedown', closeMenu);
    };
  }, [menuState]);

  const handleUploadClick = () => { fileInputRef.current?.click(); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  const startRenameSession = (session: SessionListItem) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title || `세션 ${session.id.slice(0, 8)}`);
  };

  const saveRenameSession = () => {
    if (!editingSessionId) return;
    const trimmed = editingTitle.trim();
    if (trimmed) {
      onRenameSession?.(editingSessionId, trimmed);
    }
    setEditingSessionId(null);
    setEditingTitle('');
  };

  const cancelRenameSession = () => {
    setEditingSessionId(null);
    setEditingTitle('');
  };

  if (!isOpen) {
    return (
      <aside className="w-20 border-r border-zinc-900 bg-black flex flex-col z-20">
        <div className="p-4 border-b border-zinc-900 flex justify-center">
          <button
            onClick={() => setIsOpen(true)}
            className="h-11 w-11 rounded-2xl border border-zinc-800 bg-zinc-950/90 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
            aria-label="사이드바 열기"
          >
            <Menu size={18} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-88 border-r border-zinc-900 bg-black flex flex-col z-20">
      <div className="p-5 border-b border-zinc-900 flex items-center justify-between gap-3">
        <button
          onClick={() => setIsOpen(false)}
          className="h-11 w-11 rounded-2xl border border-zinc-800 bg-zinc-950/90 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
          aria-label="사이드바 토글"
        >
          <Menu size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tighter flex items-center gap-2">
            DELUXINE <Badge className="text-[10px] bg-white text-black border-none">AI</Badge>
          </h1>
          <p className="text-[11px] text-zinc-500 mt-1 truncate">{activeSessionLabel}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onNewSession}
              className="h-12 rounded-2xl border border-zinc-800 bg-zinc-950/90 px-4 flex items-center justify-center gap-2 text-sm font-semibold text-white hover:border-white/20 hover:bg-zinc-900 transition-colors"
            >
              <FolderPlus size={16} />
              <span>새 세션</span>
            </button>
            <button
              onClick={handleUploadClick}
              disabled={status === 'analyzing' || status === 'rendering'}
              className="h-12 rounded-2xl border border-zinc-800 bg-white text-black px-4 flex items-center justify-center gap-2 text-sm font-semibold hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'analyzing' ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              <span>{(status === 'analyzing' || status === 'rendering') ? '처리 중' : '라인 업로드'}</span>
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          </div>

          {/* 버튼 바로 아래 진행률 표시 */}
          {(status === 'analyzing' || status === 'rendering') && (
            <div className="px-1 animate-in fade-in slide-in-from-top-1 duration-300">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">AI Processing</span>
                <span className="text-[10px] font-mono font-bold text-white">{progress}%</span>
              </div>
              <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white transition-all duration-500 ease-out" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <section>
          <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider mb-4 block">Session Panel</label>
          <div className="space-y-2 max-h-[24rem] overflow-y-auto rounded-3xl border border-zinc-900 bg-zinc-950/60 p-3">
            {recentSessions && recentSessions.length > 0 ? (
              recentSessions.map((session, index) => {
                const isEditing = editingSessionId === session.id;
                const displayName = session.title || `세션 ${index + 1}`;

                return (
                  <div key={session.id}>
                    <button
                      onClick={() => onSessionSelect?.(session.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setMenuState({ id: session.id, x: event.clientX, y: event.clientY });
                      }}
                      className={`w-full text-left p-3 rounded-2xl text-xs transition-colors border ${session.id === sessionId ? 'bg-zinc-800 text-white border-white/10' : 'border-transparent hover:bg-zinc-900 text-zinc-300'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{displayName}</div>
                          <div className="text-[10px] text-zinc-500 mt-1">
                            {formatKstLabel(session.updatedAt)}
                          </div>
                        </div>
                        {session.id === sessionId && <Badge className="bg-white text-black border-none">OPEN</Badge>}
                      </div>
                    </button>

                    {isEditing && (
                      <div className="mt-2 p-2 rounded-xl border border-zinc-800 bg-black/50">
                        <input
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          className="w-full h-9 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white outline-none focus:border-zinc-500"
                          placeholder="세션 이름"
                          autoFocus
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button onClick={cancelRenameSession} className="px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500">취소</button>
                          <button onClick={saveRenameSession} className="px-3 py-1.5 text-xs rounded-lg bg-white text-black font-semibold hover:bg-zinc-200">저장</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-800 p-4 text-xs text-zinc-500">세션이 없습니다. 새 세션을 만들어 시작하세요.</div>
            )}
          </div>
        </section>

        {finalImage && (
          <section className="pt-6 border-t border-zinc-900">
            <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider mb-4 block">Generated Output</label>
            <div className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl group relative cursor-pointer">
              <img src={finalImage} alt="Final Result" className="w-full h-auto transition-transform group-hover:scale-105" />
            </div>
          </section>
        )}
      </div>

      {menuState && (
        <div
          ref={menuRef}
          className="fixed z-50 w-36 rounded-xl border border-zinc-800 bg-black/95 shadow-2xl overflow-hidden"
          style={{ top: menuState.y, left: menuState.x }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              const session = recentSessions?.find((item) => item.id === menuState.id);
              if (session) startRenameSession(session);
              setMenuState(null);
            }}
            className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900"
          >
            이름 수정
          </button>
          <button
            onClick={() => {
              onDeleteSession?.(menuState.id);
              setMenuState(null);
            }}
            className="w-full px-3 py-2 text-left text-xs text-red-300 hover:bg-zinc-900"
          >
            제거
          </button>
        </div>
      )}
      
      <div className="p-4 border-t border-zinc-900 bg-zinc-950/50 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
            <User size={16} className="text-zinc-400" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-bold text-white truncate">{user?.email || 'Anonymous'}</p>
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Active Member</p>
          </div>
          <button onClick={onLogout} className="text-zinc-600 hover:text-white transition-colors"><LogOut size={16} /></button>
        </div>
      </div>
    </aside>
  );
};
