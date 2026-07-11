import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, User, Menu, FolderPlus } from 'lucide-react';
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
  finalImage?: string | null;
  user?: { email?: string | null } | null;
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
  finalImage,
  user,
  onLogout,
  recentSessions,
  onSessionSelect,
  onNewSession,
  onRenameSession,
  onDeleteSession,
}) => {
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
      <aside className="w-20 border-r border-white/5 bg-[#08080c]/90 backdrop-blur-3xl flex flex-col z-20 transition-all duration-300">
        <div className="p-4 border-b border-white/5 flex justify-center">
          <button
            onClick={() => setIsOpen(true)}
            className="h-11 w-11 rounded-2xl border border-white/5 bg-white/[0.02] flex items-center justify-center text-zinc-400 hover:text-white hover:border-white/10 hover:bg-white/[0.04] transition-all active:scale-95"
            aria-label="사이드바 열기"
          >
            <Menu size={18} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-88 border-r border-white/5 bg-[#08080c]/85 backdrop-blur-3xl flex flex-col z-20 transition-all duration-300">
      <div className="p-5 border-b border-white/5 flex items-center justify-between gap-3">
        <button
          onClick={() => setIsOpen(false)}
          className="h-11 w-11 rounded-2xl border border-white/5 bg-white/[0.02] flex items-center justify-center text-zinc-400 hover:text-white hover:border-white/10 hover:bg-white/[0.04] transition-all active:scale-95"
          aria-label="사이드바 토글"
        >
          <Menu size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black tracking-[-0.05em] text-gradient-metallic flex items-center gap-2">
            DELUXINE 
            <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-[0_0_10px_rgba(99,102,241,0.3)]">
              AI
            </span>
          </h1>
          <p className="text-[10px] font-semibold text-zinc-500 mt-1 truncate uppercase tracking-wider">{activeSessionLabel}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="space-y-4">
          <div>
            <button
              onClick={onNewSession}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 text-xs font-semibold text-zinc-300 transition-all hover:border-white/10 hover:bg-white/[0.05] hover:text-white active:scale-95"
            >
              <FolderPlus size={15} />
              <span>새 세션</span>
            </button>
          </div>

          {/* 진행률 표시 바 */}
          {(status === 'analyzing' || status === 'rendering') && (
            <div className="p-3 rounded-2xl bg-white/[0.01] border border-white/5 animate-in fade-in slide-in-from-top-1 duration-300">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">AI Processing</span>
                <span className="text-[10px] font-mono font-black text-white">{progress}%</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden p-[1px] border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-sky-400 rounded-full transition-all duration-500 ease-out shadow-[0_0_8px_rgba(99,102,241,0.8)]" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <section>
          <label className="text-[9px] font-bold uppercase text-zinc-500 tracking-[0.15em] mb-3 block">Sessions</label>
          <div className="space-y-1.5 max-h-[24rem] overflow-y-auto rounded-2xl border border-white/5 bg-zinc-950/20 p-2">
            {recentSessions && recentSessions.length > 0 ? (
              recentSessions.map((session, index) => {
                const isEditing = editingSessionId === session.id;
                const displayName = session.title || `세션 ${index + 1}`;
                const isActive = session.id === sessionId;

                return (
                  <div key={session.id} className="group/item">
                    <button
                      onClick={() => onSessionSelect?.(session.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setMenuState({ id: session.id, x: event.clientX, y: event.clientY });
                      }}
                      className={`w-full text-left p-3 rounded-xl text-xs transition-all border ${
                        isActive 
                          ? 'bg-gradient-to-r from-indigo-500/10 to-purple-500/5 text-white border-indigo-500/30 shadow-[0_4px_15px_rgba(99,102,241,0.06)]' 
                          : 'border-transparent bg-transparent hover:bg-white/[0.02] hover:border-white/5 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className={`truncate font-medium ${isActive ? 'text-white' : 'text-zinc-300'}`}>{displayName}</div>
                          <div className="text-[9px] text-zinc-500 font-mono mt-1">
                            {formatKstLabel(session.updatedAt)}
                          </div>
                        </div>
                        {isActive && (
                          <span className="text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-white text-black uppercase scale-90">
                            Active
                          </span>
                        )}
                      </div>
                    </button>

                    {isEditing && (
                      <div className="mt-2 p-3 rounded-xl border border-white/5 bg-white/[0.01] backdrop-blur-md">
                        <input
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          className="w-full h-9 rounded-lg border border-white/10 bg-zinc-950 px-3 text-xs text-white outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                          placeholder="세션 이름"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRenameSession();
                            if (e.key === 'Escape') cancelRenameSession();
                          }}
                        />
                        <div className="mt-2 flex justify-end gap-1.5">
                          <button onClick={cancelRenameSession} className="px-2.5 py-1.5 text-[10px] rounded-md border border-white/5 text-zinc-400 hover:text-white hover:bg-white/[0.02] transition-colors">취소</button>
                          <button onClick={saveRenameSession} className="px-2.5 py-1.5 text-[10px] rounded-md bg-white text-black font-semibold hover:bg-zinc-200 transition-colors">저장</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-white/5 p-5 text-center text-xs text-zinc-600 font-medium">
                세션이 없습니다.<br/>새 세션을 만들어 시작하세요.
              </div>
            )}
          </div>
        </section>

        {finalImage && (
          <section className="pt-4 border-t border-white/5">
            <label className="text-[9px] font-bold uppercase text-zinc-500 tracking-[0.15em] mb-3 block">Generated Output</label>
            <div className="rounded-2xl overflow-hidden border border-white/5 bg-zinc-950 shadow-2xl group relative cursor-pointer">
              <img src={finalImage} alt="Final Result" className="w-full h-auto transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                <span className="text-[9px] text-zinc-300 font-mono">View full render</span>
              </div>
            </div>
          </section>
        )}
      </div>

      {menuState && (
        <div
          ref={menuRef}
          className="fixed z-50 w-36 glass-panel rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] border-white/5 overflow-hidden p-1"
          style={{ top: menuState.y, left: menuState.x }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              const session = recentSessions?.find((item) => item.id === menuState.id);
              if (session) startRenameSession(session);
              setMenuState(null);
            }}
            className="w-full px-3 py-2 text-left text-xs rounded-lg text-zinc-300 hover:bg-white/[0.04] hover:text-white transition-colors"
          >
            이름 수정
          </button>
          <button
            onClick={() => {
              onDeleteSession?.(menuState.id);
              setMenuState(null);
            }}
            className="w-full px-3 py-2 text-left text-xs rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
          >
            제거
          </button>
        </div>
      )}
      
      <div className="p-4 border-t border-white/5 bg-zinc-950/20 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center relative shadow-inner">
            <User size={14} className="text-zinc-400" />
            <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-emerald-500 border border-zinc-950" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-semibold text-zinc-300 truncate">{user?.email || 'Anonymous'}</p>
            <p className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest mt-0.5">Active Member</p>
          </div>
          <button 
            onClick={onLogout} 
            className="text-zinc-600 hover:text-red-400 transition-colors p-1.5 hover:bg-white/[0.02] rounded-lg"
            title="Log out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
};

