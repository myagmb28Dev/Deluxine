import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type {
  RenderModelId,
  RenderModelOption,
  RenderUsageResponse,
} from '../../types/api';
import { getRenderUsageRatio } from '../../lib/renderModel';

interface PromptBarProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onRender: () => void;
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  isRenderDisabled: boolean;
  errorMessage?: string | null;
  statusMessage?: string | null;
  models: RenderModelOption[];
  usage: RenderUsageResponse | null;
  isLoadingUsage: boolean;
  usageErrorMessage?: string | null;
  selectedModel: RenderModelId | null;
  onModelChange: (model: RenderModelId) => void;
  isLoadingModels: boolean;
  modelErrorMessage?: string | null;
  onRetryModels: () => void;
  onRetryUsage: () => void;
}

const tierLabels: Record<RenderModelOption['tier'], string> = {
  balanced: '균형형',
  value: '가성비',
  premium: '고품질',
};

const modelValueOrder: Record<RenderModelOption['tier'], number> = {
  value: 0,
  balanced: 1,
  premium: 2,
};

export const PromptBar: React.FC<PromptBarProps> = ({
  prompt,
  onPromptChange,
  onRender,
  onFileSelect,
  isLoading,
  isRenderDisabled,
  errorMessage,
  statusMessage,
  models,
  usage,
  isLoadingUsage,
  usageErrorMessage,
  selectedModel,
  onModelChange,
  isLoadingModels,
  modelErrorMessage,
  onRetryModels,
  onRetryUsage,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const selectedOption = models.find((model) => model.id === selectedModel) ?? null;
  const displayModels = [...models].sort(
    (left, right) => modelValueOrder[left.tier] - modelValueOrder[right.tier],
  );
  const controlsDisabled = isLoading;
  const usageRatio = usage ? getRenderUsageRatio(usage.daily) : 0;
  const usageLabel = usage ? `${usage.daily.used}/${usage.daily.limit}` : '--/--';
  const usageTitle = usage
    ? `오늘 ${usage.daily.used}/${usage.daily.limit}회 사용 · ${usage.daily.remaining}회 남음 · ${new Date(usage.daily.resets_at).toLocaleString('ko-KR')} 초기화`
    : '렌더링 사용량을 불러오는 중입니다.';

  useEffect(() => {
    if (!isModelMenuOpen) return;

    const closeMenu = (event: MouseEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', closeMenu);
    return () => window.removeEventListener('mousedown', closeMenu);
  }, [isModelMenuOpen]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFileSelect(file);
  };

  return (
    <motion.div
      initial={{ y: 32, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="absolute bottom-5 left-1/2 z-30 w-[760px] max-w-[calc(100%-32px)] -translate-x-1/2"
    >
      {(errorMessage || modelErrorMessage || usageErrorMessage) && (
        <div className="mb-2 rounded-lg border border-red-500/20 bg-red-950/70 px-4 py-3 text-xs text-red-100 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <span>{errorMessage || modelErrorMessage || usageErrorMessage}</span>
            {(modelErrorMessage || usageErrorMessage) && (
              <button
                type="button"
                onClick={modelErrorMessage ? onRetryModels : onRetryUsage}
                disabled={isLoadingModels || isLoadingUsage}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-red-100 hover:bg-white/10 disabled:opacity-50"
              >
                <RefreshCw size={13} className={(isLoadingModels || isLoadingUsage) ? 'animate-spin' : ''} />
                다시 시도
              </button>
            )}
          </div>
        </div>
      )}

      {statusMessage && !errorMessage && (
        <div className="mb-2 rounded-lg border border-white/10 bg-black/75 px-4 py-2.5 text-xs text-zinc-300 backdrop-blur-xl">
          <span className="inline-flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-zinc-100" />
            {statusMessage}
          </span>
        </div>
      )}

      <div className="rounded-[24px] border border-indigo-400/30 bg-[#0a0712]/95 p-2.5 shadow-[0_0_28px_rgba(124,58,237,0.24),0_18px_50px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
        <textarea
          rows={2}
          placeholder="후속 변경 사항이 있다면 입력해 주세요 (선택)"
          className="max-h-32 min-h-16 w-full resize-none border-none bg-transparent px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          disabled={controlsDisabled}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (!isRenderDisabled && !isLoading) onRender();
            }
          }}
        />

        <div className="flex min-w-0 items-center justify-between gap-3 px-1 pb-0.5">
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={controlsDisabled}
              title="이미지 추가"
              aria-label="이미지 추가"
              className="flex h-9 w-9 items-center justify-center rounded-full text-indigo-300 transition-colors hover:bg-indigo-500/20 hover:text-white hover:shadow-[0_0_14px_rgba(129,140,248,0.45)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={21} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <div ref={modelMenuRef} className="relative min-w-0">
              <button
                type="button"
                onClick={() => setIsModelMenuOpen((open) => !open)}
                disabled={controlsDisabled || isLoadingModels || models.length === 0}
                aria-haspopup="listbox"
                aria-expanded={isModelMenuOpen}
                className="flex h-9 max-w-[250px] items-center gap-2 rounded-full border border-indigo-400/15 bg-indigo-500/[0.06] px-3 text-xs font-medium text-zinc-200 transition-all hover:border-indigo-400/35 hover:bg-indigo-500/15 hover:shadow-[0_0_14px_rgba(99,102,241,0.22)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className="truncate">{selectedOption?.name ?? '모델 선택'}</span>
                <ChevronDown size={14} className="shrink-0 text-zinc-500" />
              </button>

              {isModelMenuOpen && (
                <div
                  role="listbox"
                  className="absolute bottom-12 right-0 w-[340px] max-w-[calc(100vw-40px)] overflow-hidden rounded-xl border border-indigo-400/25 bg-[#0b0714] p-1.5 shadow-[0_0_30px_rgba(124,58,237,0.28),0_20px_50px_rgba(0,0,0,0.65)]"
                >
                  {displayModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      aria-selected={model.id === selectedModel}
                      onClick={() => {
                        onModelChange(model.id);
                        setIsModelMenuOpen(false);
                      }}
                      className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-indigo-500/10"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{model.name}</span>
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-zinc-300">
                            {tierLabels[model.tier]}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-4 text-zinc-400">
                          {model.description}
                        </p>
                      </div>
                      {model.id === selectedModel && <Check size={16} className="mt-0.5 shrink-0 text-white" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div
              title={usageTitle}
              aria-label={usageTitle}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-950/35 shadow-[0_0_16px_rgba(124,58,237,0.35)]"
            >
              <svg className="absolute inset-0 h-10 w-10 -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
                <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(99,102,241,0.18)" strokeWidth="3" />
                <circle
                  cx="20"
                  cy="20"
                  r="16"
                  fill="none"
                  pathLength="100"
                  stroke="url(#render-usage-gradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="100"
                  strokeDashoffset={100 - (usageRatio * 100)}
                  className="transition-[stroke-dashoffset] duration-500"
                />
                <defs>
                  <linearGradient id="render-usage-gradient" x1="0" y1="0" x2="40" y2="40">
                    <stop offset="0%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#c026d3" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="relative text-[9px] font-bold tabular-nums text-indigo-100">
                {isLoadingUsage ? '...' : usageLabel}
              </span>
            </div>

            <button
              type="button"
              onClick={onRender}
              disabled={isLoading || isRenderDisabled}
              title="렌더링 시작"
              aria-label="렌더링 시작"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 via-violet-500 to-fuchsia-600 text-white shadow-[0_0_18px_rgba(139,92,246,0.55)] transition-all hover:brightness-110 hover:shadow-[0_0_26px_rgba(192,38,211,0.6)] active:scale-95 disabled:cursor-not-allowed disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-500 disabled:shadow-none"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={19} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
