import React from 'react';
import { motion } from 'framer-motion';
import { Play, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '../ui';

interface PromptBarProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  onRender: () => void;
  isLoading: boolean;
  errorMessage?: string | null;
}

export const PromptBar: React.FC<PromptBarProps> = ({ prompt, onPromptChange, onRender, isLoading, errorMessage }) => {
  return (
    <motion.div 
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[720px] z-30"
    >
      {errorMessage && (
        <div className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          {errorMessage}
        </div>
      )}
      <div className="bg-black/60 backdrop-blur-3xl border border-white/10 p-2 rounded-full shadow-[0_30px_60px_rgba(0,0,0,0.8)] flex items-center gap-2">
        <div className="pl-6 text-white/30"><Sparkles size={20} /></div>
        <input 
          type="text" 
          placeholder="배경이나 분위기를 설명해주세요 (선택사항)" 
          className="flex-1 bg-transparent border-none text-[15px] px-2 py-3 focus:outline-none text-white placeholder:text-white/20 font-medium"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
        />
        <Button 
          className="h-12 px-10 rounded-full font-black tracking-tighter transition-all active:scale-95 bg-white text-black hover:bg-zinc-200"
          onClick={onRender}
          disabled={isLoading}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="animate-spin" size={20} />
              <span>포즈 적용 중...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Play fill="currentColor" size={16} />
              <span>포즈 적용 및 수정</span>
            </div>
          )}
        </Button>
      </div>
    </motion.div>
  );
};
