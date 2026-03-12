import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Button } from '../ui';

interface LoginViewProps {
  onLogin: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  return (
    <div className="h-screen w-full bg-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-white/[0.03] blur-[120px] rounded-full" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 flex flex-col items-center text-center max-w-md w-full"
      >
        <div className="mb-12">
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="w-20 h-20 bg-white flex items-center justify-center rounded-3xl mb-8 shadow-[0_0_50px_rgba(255,255,255,0.2)]"
          >
            <Sparkles className="text-black" size={40} />
          </motion.div>
          <h1 className="text-5xl font-black tracking-tighter text-white mb-4">DELUXINE</h1>
          <p className="text-zinc-500 text-sm tracking-[0.2em] font-medium uppercase">Next-Gen AI Image Pipeline</p>
        </div>

        <div className="w-full space-y-4">
          <Button 
            className="w-full h-14 rounded-2xl text-lg font-bold bg-white text-black hover:bg-zinc-200 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
            onClick={onLogin}
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            Sign in with Google
          </Button>
          
          <div className="pt-8">
            <p className="text-zinc-600 text-[11px] leading-relaxed">
              By continuing, you agree to Deluxine's <br />
              <span className="text-zinc-400 cursor-pointer hover:text-white transition-colors">Terms of Service</span> and <span className="text-zinc-400 cursor-pointer hover:text-white transition-colors">Privacy Policy</span>.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Decorative Elements */}
      <div className="absolute bottom-12 text-[10px] text-zinc-800 font-mono tracking-widest uppercase">
        System Node: 0x9AF2 - Authorized Access Only
      </div>
    </div>
  );
};
