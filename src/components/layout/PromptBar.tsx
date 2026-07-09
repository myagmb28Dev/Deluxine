import React from 'react';
import { motion } from 'framer-motion';
import { Loader2, Play, Sparkles } from 'lucide-react';
import { Button } from '../ui';

interface PromptBarProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  onRender: () => void;
  isLoading: boolean;
  errorMessage?: string | null;
}

export const PromptBar: React.FC<PromptBarProps> = ({
  prompt,
  onPromptChange,
  onRender,
  isLoading,
  errorMessage,
}) => {
  return (
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="absolute bottom-10 left-1/2 z-30 w-[720px] max-w-[calc(100%-48px)] -translate-x-1/2"
    >
      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-3 rounded-2xl border border-red-500/20 bg-red-950/20 px-5 py-3 text-xs text-red-200 shadow-lg backdrop-blur-md"
        >
          {errorMessage}
        </motion.div>
      )}

      <div className="flex items-center gap-2 rounded-full border border-white/5 bg-[#0b0b12]/60 p-2 shadow-[0_25px_50px_rgba(0,0,0,0.6)] backdrop-blur-3xl">
        <div className="pl-5 text-indigo-400/80">
          <Sparkles size={18} className="animate-pulse" />
        </div>
        <input
          type="text"
          placeholder="배경이나 분위기를 설명해 주세요. (선택 사항)"
          className="flex-1 border-none bg-transparent px-2 py-3 text-sm font-medium text-white placeholder:text-zinc-500 focus:outline-none"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          disabled={isLoading}
        />
        <Button
          className="flex h-12 items-center justify-center rounded-full border-none bg-gradient-to-r from-indigo-500 to-purple-600 px-8 text-xs font-bold tracking-wider text-white transition-all duration-300 hover:from-indigo-400 hover:to-purple-500 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] active:scale-95"
          onClick={onRender}
          disabled={isLoading}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="animate-spin" size={16} />
              <span>처리 중...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Play fill="currentColor" size={12} className="ml-0.5" />
              <span>프롬프트 적용</span>
            </div>
          )}
        </Button>
      </div>
    </motion.div>
  );
};
