import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '../ui';

interface LoginViewProps {
  onLogin: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  return (
    <div className="h-screen w-full bg-[#040406] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Animated Aurora Background Mesh Glows */}
      <div className="absolute top-[20%] left-[20%] w-[350px] h-[350px] bg-indigo-500/10 blur-[100px] rounded-full animate-aurora-1 pointer-events-none" />
      <div className="absolute bottom-[20%] right-[20%] w-[450px] h-[450px] bg-purple-500/10 blur-[120px] rounded-full animate-aurora-2 pointer-events-none" />
      <div className="absolute top-[50%] left-[60%] w-[250px] h-[250px] bg-sky-500/5 blur-[80px] rounded-full animate-aurora-3 pointer-events-none" />

      {/* Cybernetic grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.003)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.003)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="z-10 flex flex-col items-center text-center max-w-md w-full glass-panel p-10 rounded-3xl neon-glow-indigo border-white/5"
      >
        <div className="mb-10">
          <motion.div 
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="inline-block"
          >
            <h1 className="text-5xl font-black tracking-[-0.07em] text-gradient-metallic mb-2">
              DELUXINE
            </h1>
          </motion.div>
          <div className="h-[2px] w-12 bg-gradient-to-r from-indigo-500 to-purple-500 mx-auto my-3 rounded-full" />
          <p className="text-zinc-400 text-[10px] tracking-[0.3em] font-semibold uppercase">
            3D Pose Control AI Platform
          </p>
        </div>

        <div className="w-full space-y-6">
          <p className="text-zinc-500 text-xs leading-relaxed max-w-[280px] mx-auto">
            Upload your line art, customize the 3D mannequin pose, and generate high-fidelity AI rendering.
          </p>

          <Button 
            className="w-full h-14 rounded-2xl text-sm font-semibold bg-white text-black hover:bg-zinc-100 transition-all active:scale-[0.97] flex items-center justify-center gap-3 shadow-[0_4px_20px_rgba(255,255,255,0.15)]"
            onClick={onLogin}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </Button>
          
          <div className="pt-4">
            <p className="text-zinc-600 text-[10px] leading-relaxed">
              By continuing, you agree to Deluxine's <br />
              <span className="text-zinc-500 cursor-pointer hover:text-white transition-colors">Terms of Service</span> & <span className="text-zinc-500 cursor-pointer hover:text-white transition-colors">Privacy Policy</span>.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Decorative Bottom Elements */}
      <div className="absolute bottom-10 flex items-center gap-2 text-[9px] text-zinc-600 font-mono tracking-widest uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
        System Node: 0x9AF2 - Authorized Access Only
      </div>
    </div>
  );
};

