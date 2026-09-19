import React from 'react';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({ 
  size = 'md', 
  showText = false,
  className = '' 
}) => {
  const sizeMap = {
    sm: { container: 'w-8 h-8 rounded-lg p-1.5', icon: 'w-5 h-5', text: 'text-sm' },
    md: { container: 'w-10 h-10 rounded-xl p-2', icon: 'w-6 h-6', text: 'text-lg' },
    lg: { container: 'w-12 h-12 rounded-2xl p-2.5', icon: 'w-7 h-7', text: 'text-xl' },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Dynamic Calypso & Magenta Gradient Squircle Icon */}
      <div 
        className={`relative flex items-center justify-center bg-gradient-to-br from-cyan-500 via-teal-500 to-fuchsia-600 text-white shadow-md shadow-cyan-500/20 dark:shadow-fuchsia-900/30 transition-transform hover:scale-105 ${currentSize.container}`}
      >
        <svg 
          viewBox="0 0 100 100" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg" 
          className="w-full h-full drop-shadow-sm"
        >
          {/* Stylized Modern Letter "R" */}
          <path 
            d="M 22 20 H 52 C 68 20, 74 30, 74 42 C 74 54, 66 62, 52 62 H 38 V 80 H 22 V 20 Z M 38 34 V 48 H 50 C 58 48, 60 43, 60 41 C 60 38, 57 34, 50 34 H 38 Z" 
            fill="currentColor" 
          />
          {/* Diagonal leg of "R" */}
          <path 
            d="M 46 56 L 68 80 H 84 L 58 54 Z" 
            fill="currentColor" 
          />

          {/* Double Check / Ticket Icon (Teal-Cyan Luminous Overlay at bottom right) */}
          <g transform="translate(48, 48)">
            {/* Background Pill for contrast */}
            <circle cx="28" cy="28" r="20" fill="#0f172a" opacity="0.85" />
            <circle cx="28" cy="28" r="18" fill="url(#checkGrad)" />

            {/* First Checkmark */}
            <path 
              d="M 16 28 L 22 34 L 34 22" 
              stroke="#ffffff" 
              strokeWidth="4" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
            {/* Second Checkmark (Double Ticket OK) */}
            <path 
              d="M 24 28 L 30 34 L 42 22" 
              stroke="#a5f3fc" 
              strokeWidth="4" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          </g>

          <defs>
            <linearGradient id="checkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {showText && (
        <div>
          <h1 className={`font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-tight ${currentSize.text}`}>
            Gestión de <span className="bg-gradient-to-r from-teal-500 via-cyan-500 to-fuchsia-500 bg-clip-text text-transparent">Vencimientos</span>
          </h1>
          <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
            Revisado & Validado
          </span>
        </div>
      )}
    </div>
  );
};
