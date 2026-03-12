import React from 'react';

interface ProgressBarProps {
  progress: number;
  status: 'idle' | 'analyzing' | 'editing' | 'rendering' | 'completed' | 'failed' | 'pending';
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, status }) => {
  const getStatusText = () => {
    switch (status) {
      case 'analyzing':
        return `AI 분석 중... ${progress}%`;
      case 'rendering':
        return `렌더링 중... ${progress}%`;
      case 'completed':
        return '완료!';
      case 'failed':
        return '실패';
      default:
        return `처리 중... ${progress}%`;
    }
  };

  const getBarColor = () => {
    if (status === 'failed') return 'bg-red-500';
    if (status === 'completed') return 'bg-green-500';
    return 'bg-white';
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">{getStatusText()}</span>
        <span className="text-zinc-500 font-mono">{progress}%</span>
      </div>
      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${getBarColor()} transition-all duration-300`}
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
    </div>
  );
};
