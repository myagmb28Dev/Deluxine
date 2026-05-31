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
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[720px] z-30"
    >
      {errorMessage && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-3 rounded-2xl border border-red-500/20 bg-red-950/20 backdrop-blur-md px-5 py-3 text-xs text-red-200 shadow-lg"
        >
          {errorMessage}
        </motion.div>
      )}
      <div className="bg-[#0b0b12]/60 backdrop-blur-3xl border border-white/5 p-2 rounded-full shadow-[0_25px_50px_rgba(0,0,0,0.6)] flex items-center gap-2">
        <div className="pl-5 text-indigo-400/80"><Sparkles size={18} className="animate-pulse" /></div>
        <input 
          type="text" 
          placeholder="배경이나 분위기를 설명해주세요 (선택사항)" 
          className="flex-1 bg-transparent border-none text-sm px-2 py-3 focus:outline-none text-white placeholder:text-zinc-500 font-medium"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={isLoading}
        />
        <Button 
          className="h-12 px-8 rounded-full font-bold text-xs tracking-wider transition-all duration-300 active:scale-95 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] text-white border-none flex items-center justify-center"
          onClick={onRender}
          disabled={isLoading}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="animate-spin" size={16} />
              <span>포즈 적용 중...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Play fill="currentColor" size={12} className="ml-0.5" />
              <span>포즈 적용 및 수정</span>
            </div>
          )}
        </Button>
      </div>
    </motion.div>
  );
};
