import React from 'react';
import { motion } from 'framer-motion';
import { Play, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '../ui';

interface PromptBarProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  onRender: () => void;
  isLoading: boolean;
}

export const PromptBar: React.FC<PromptBarProps> = ({ prompt, onPromptChange, onRender, isLoading }) => {
  return (
    <motion.div 
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[700px] z-30"
    >
      <div className="bg-zinc-900/40 backdrop-blur-2xl border border-white/5 p-1.5 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-2">
        <div className="pl-6 text-zinc-500"><Sparkles size={18} /></div>
        <input 
          type="text" 
          placeholder="Describe the background and mood (e.g. 'cinematic lighting, sunset rooftop')" 
          className="flex-1 bg-transparent border-none text-sm px-2 py-3 focus:outline-none text-white placeholder:text-zinc-600"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
        />
        <Button 
          className="h-11 px-8 rounded-full font-bold transition-all active:scale-95"
          onClick={onRender}
          disabled={isLoading || !prompt}
        >
          {isLoading ? <Loader2 className="animate-spin mr-2" size={18} /> : <Play className="mr-2" size={18} />}
          {isLoading ? 'RENDERING' : 'GENERATE'}
        </Button>
      </div>
    </motion.div>
  );
};
