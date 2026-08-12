import React from 'react';

interface FDLogoProps {
  className?: string;
  iconOnly?: boolean;
  lightText?: boolean;
}

export const FDLogo: React.FC<FDLogoProps> = ({ 
  className = '', 
  iconOnly = false,
  lightText = false 
}) => {
  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Dynamic FD Vector Teardrop Pin Logo */}
      <div className="w-10 h-10 shrink-0 transform transition-transform duration-300 hover:rotate-6">
        <svg viewBox="0 0 160 160" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Main Red Teardrop/Droplet Background pointing to bottom-right */}
          <path 
            d="M80 15 C44.1 15 15 44.1 15 80 C15 115.9 44.1 145 80 145 C101 145 145 145 145 145 C145 145 145 101 145 80 C145 44.1 115.9 15 80 15 Z" 
            fill="#e31c24"
          />
          
          {/* Concentric Thin White Inner Droplet Border */}
          <path 
            d="M80 23 C48.5 23 23 48.5 23 80 C23 111.5 48.5 137 80 137 C98.5 137 137 137 137 137 C137 137 137 98.5 137 80 C137 48.5 111.5 23 80 23 Z" 
            fill="none" 
            stroke="#ffffff" 
            strokeWidth="3.5" 
          />
          
          {/* Combined White Letter F & D */}
          {/* Vertical left stem */}
          <rect x="49" y="49" width="16" height="62" rx="3.5" fill="#ffffff" />
          
          {/* Outer Loop of letter D */}
          <path 
            d="M49 49 H81 C96.5 49 110 62.5 110 79.5 C110 96.5 96.5 110 81 110 H49" 
            stroke="#ffffff" 
            strokeWidth="15.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            fill="none" 
          />
          
          {/* Middle bar of letter F */}
          <rect x="61" y="73.5" width="23" height="12" rx="2" fill="#ffffff" />
        </svg>
      </div>

      {!iconOnly && (
        <div className="flex flex-col items-start leading-none">
          <div className="flex items-baseline font-sans">
            <span className={`text-[19px] font-black tracking-tight ${lightText ? 'text-white' : 'text-slate-900'}`}>
              Printing Center
            </span>
            <span className="text-[#e31c24] font-black text-[20px] ml-0.5">.nl</span>
          </div>
          <span className={`text-[9px] font-bold tracking-widest uppercase mt-1 ${lightText ? 'text-slate-400' : 'text-slate-500'}`}>
            PRE-PRESS CONTROLE
          </span>
        </div>
      )}
    </div>
  );
};
