import React from 'react';
import { LOGO_PATHS, LOGO_VIEWBOX } from './fdLogoPaths';

interface FDLogoProps {
  className?: string;
  iconOnly?: boolean;
  /** Witte tekst voor donkere achtergronden. */
  lightText?: boolean;
}

/** Het officiële logo als vector: scherp op elk scherm en in print. */
export const FDLogo: React.FC<FDLogoProps> = ({ className = '', iconOnly = false, lightText = false }) => {
  const width = iconOnly ? LOGO_VIEWBOX.iconWidth : LOGO_VIEWBOX.width;
  return (
    <div className={`flex items-center select-none ${className}`}>
      <div className={`shrink-0 ${iconOnly ? 'h-10 w-10' : 'h-11'}`}>
        <svg
          viewBox={`0 0 ${width} ${LOGO_VIEWBOX.height}`}
          className="h-full w-auto"
          role="img"
          aria-label="FD Printing Center"
          xmlns="http://www.w3.org/2000/svg"
          style={{ color: lightText ? '#ffffff' : '#231f20' }}
        >
          <defs>
            <mask id="fd-logo-holes" maskUnits="userSpaceOnUse" x="0" y="0" width={LOGO_VIEWBOX.width} height={LOGO_VIEWBOX.height}>
              <rect width={LOGO_VIEWBOX.width} height={LOGO_VIEWBOX.height} fill="#fff" />
              {LOGO_PATHS.white.map((d, i) => <path key={i} d={d} fill="#000" />)}
            </mask>
          </defs>
          {!iconOnly && (
            <g mask="url(#fd-logo-holes)" fill="currentColor">
              {LOGO_PATHS.dark.map((d, i) => <path key={i} d={d} />)}
            </g>
          )}
          {LOGO_PATHS.red.map((d, i) => <path key={i} d={d} fill="#ed1c24" />)}
          {LOGO_PATHS.off.map((d, i) => <path key={i} d={d} fill="#faf9fa" />)}
        </svg>
      </div>
    </div>
  );
};
