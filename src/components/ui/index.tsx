import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' }>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const variants = {
      primary: 'bg-white text-black hover:bg-gray-200',
      secondary: 'bg-zinc-800 text-white hover:bg-zinc-700',
      outline: 'bg-transparent border border-zinc-700 text-white hover:border-white'
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all',
        className
      )}
      {...props}
    />
  )
);

export const Badge = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <span className={cn('px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border border-zinc-700 bg-zinc-800 text-zinc-300', className)}>
    {children}
  </span>
);
