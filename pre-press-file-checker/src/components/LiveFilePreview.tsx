/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Camera, Compass, Eye, ShieldAlert, Sparkles, Scale, Layers, Trash2, File as FileIcon, Image as ImageIcon, UploadCloud, Maximize2, Minimize2, ArrowLeftRight } from 'lucide-react';
import { PrintProduct, FitMode, StickerShape } from '../types';

interface LiveFilePreviewProps {
  selectedProduct: PrintProduct;
  widthMm: number;
  heightMm: number;
  imageSrcUrl: string | null;
  backImageSrcUrl?: string | null;
  frontFitMode: FitMode;
  backFitMode: FitMode;
  onSetFrontFitMode: (mode: FitMode) => void;
  onSetBackFitMode: (mode: FitMode) => void;
  frontRotationDegrees: number;
  backRotationDegrees: number;
  activeFocusedSide: 'front' | 'back';
  onActiveFocusedSideChange: (side: 'front' | 'back') => void;
  pixelWidth: number;
  pixelHeight: number;
  backPixelWidth?: number;
  backPixelHeight?: number;
  stickerShape: StickerShape;
  isPdf?: boolean;
  printSides?: 'single' | 'double';
  
  // Custom states for double-sided document flows
  pdfPages?: { dataUrl: string; width: number; height: number; filename?: string }[];
  selectedFrontPageIdx?: number;
  selectedBackPageIdx?: number;
  onSelectFrontPageIdx?: (idx: number, side: 'front' | 'back') => void;
  onSelectBackPageIdx?: (idx: number) => void;
  onDropPdfPage?: (idx: number, side: 'front' | 'back') => void;
  onDropLocalFile?: (file: File, side: 'front' | 'back') => void;
  
  activeFileName?: string | null;
  backActiveFileName?: string | null;
  onClearFile?: (side: 'front' | 'back' | 'both') => void;
  onSwapSides?: () => void;
}

export default function LiveFilePreview({
  selectedProduct,
  widthMm,
  heightMm,
  imageSrcUrl,
  backImageSrcUrl,
  frontFitMode,
  backFitMode,
  onSetFrontFitMode,
  onSetBackFitMode,
  frontRotationDegrees,
  backRotationDegrees,
  activeFocusedSide,
  onActiveFocusedSideChange,
  pixelWidth,
  pixelHeight,
  backPixelWidth = 0,
  backPixelHeight = 0,
  stickerShape,
  isPdf = false,
  printSides = 'single',
  pdfPages = [],
  selectedFrontPageIdx = 0,
  selectedBackPageIdx = 1,
  onSelectFrontPageIdx,
  onSelectBackPageIdx,
  onDropPdfPage,
  onDropLocalFile,
  activeFileName,
  backActiveFileName,
  onClearFile,
  onSwapSides,
}: LiveFilePreviewProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [allowDistortion, setAllowDistortion] = useState(false);
  
  // Independent drag over states for both slots
  const [isFrontDragOver, setIsFrontDragOver] = useState(false);
  const [isBackDragOver, setIsBackDragOver] = useState(false);

  // Hidden file inputs for direct click upload
  const frontInputRef = React.useRef<HTMLInputElement>(null);
  const backInputRef = React.useRef<HTMLInputElement>(null);

  const handleEmptySlotClick = (side: 'front' | 'back') => {
    if (side === 'front') {
      frontInputRef.current?.click();
    } else {
      backInputRef.current?.click();
    }
  };

  // Sizing modifiers for double sided
  const isDouble = printSides === 'double';
  const productAspectRatio = widthMm / heightMm;
  const isLandscape = productAspectRatio > 1;

  // Previews should be shown larger as requested.
  // Since front and back are stacked vertically, they don't share horizontal space and can be beautifully large!
  const maxWidth = isMaximized ? 850 : 540;
  const maxHeight = isMaximized ? 720 : 540;

  let computedWidth = maxWidth;
  let computedHeight = maxHeight;

  if (productAspectRatio > maxWidth / maxHeight) {
    computedWidth = maxWidth;
    computedHeight = maxWidth / productAspectRatio;
  } else {
    computedHeight = maxHeight;
    computedWidth = maxHeight * productAspectRatio;
  }

  // Keyboard shortcut listener to delete preview or close maximized screen
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Direct pass if focused element is a text input, textarea or contenteditable element
      const activeEl = document.activeElement;
      if (
        activeEl && (
          activeEl.tagName === 'INPUT' || 
          activeEl.tagName === 'TEXTAREA' || 
          activeEl.getAttribute('contenteditable') === 'true'
        )
      ) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (onClearFile) {
          const fileExists = activeFocusedSide === 'front' ? imageSrcUrl : backImageSrcUrl;
          if (!isDouble) {
            if (imageSrcUrl) {
              onClearFile('both');
            }
          } else {
            if (fileExists) {
              onClearFile(activeFocusedSide);
            }
          }
        }
      } else if (e.key === 'Escape') {
        if (isMaximized) {
          setIsMaximized(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFocusedSide, onClearFile, isDouble, isMaximized, imageSrcUrl, backImageSrcUrl]);

  // Border-radius geometries for stickers
  let borderRadiusStyle = '0px';
  let innerCropStyle = '0px';
  if (selectedProduct.category === 'Sticker') {
    if (stickerShape === 'circle') {
      borderRadiusStyle = '50%';
      innerCropStyle = '50%';
    } else if (stickerShape === 'oval') {
      borderRadiusStyle = '9999px';
      innerCropStyle = '9999px';
    } else if (stickerShape === 'die-cut') {
      borderRadiusStyle = '24px';
      innerCropStyle = '18px';
    } else {
      borderRadiusStyle = '10px';
      innerCropStyle = '8px';
    }
  }

  const previewBoxStyle: React.CSSProperties = {
    width: `${computedWidth}px`,
    height: `${computedHeight}px`,
    borderRadius: borderRadiusStyle,
  };

  // Helper calculations for manual positioning scale values - SPLIT for front and back
  const [isFrontManualActive, setIsFrontManualActive] = useState(false);
  const [frontManualLeft, setFrontManualLeft] = useState(0);
  const [frontManualTop, setFrontManualTop] = useState(0);
  const [frontManualWidth, setFrontManualWidth] = useState(0);
  const [frontManualHeight, setFrontManualHeight] = useState(0);

  const [isBackManualActive, setIsBackManualActive] = useState(false);
  const [backManualLeft, setBackManualLeft] = useState(0);
  const [backManualTop, setBackManualTop] = useState(0);
  const [backManualWidth, setBackManualWidth] = useState(0);
  const [backManualHeight, setBackManualHeight] = useState(0);

  const getManualProps = (side: 'front' | 'back') => {
    if (side === 'front') {
      return {
        isActive: isFrontManualActive,
        left: frontManualLeft,
        top: frontManualTop,
        width: frontManualWidth,
        height: frontManualHeight,
        rotation: frontRotationDegrees,
        fitMode: frontFitMode,
      };
    } else {
      return {
        isActive: isBackManualActive,
        left: backManualLeft,
        top: backManualTop,
        width: backManualWidth,
        height: backManualHeight,
        rotation: backRotationDegrees,
        fitMode: backFitMode,
      };
    }
  };

  const getInitialBounds = (side: 'front' | 'back') => {
    const sideRotation = side === 'front' ? frontRotationDegrees : backRotationDegrees;
    const isRotatedRot = sideRotation % 180 !== 0;

    const pw = side === 'front' ? pixelWidth : (backPixelWidth || pixelWidth);
    const ph = side === 'front' ? pixelHeight : (backPixelHeight || pixelHeight);

    const baseAspect = (pw && ph) ? (pw / ph) : productAspectRatio;
    const sideFileAspectRatio = isRotatedRot ? (1 / baseAspect) : baseAspect;

    let initialWidth = computedWidth;
    let initialHeight = computedHeight;
    let initialLeft = 0;
    let initialTop = 0;

    const sideFitMode = side === 'front' ? frontFitMode : backFitMode;

    if (sideFitMode === 'fit') {
      if (productAspectRatio > sideFileAspectRatio) {
        initialWidth = computedHeight * sideFileAspectRatio;
        initialHeight = computedHeight;
        initialLeft = (computedWidth - initialWidth) / 2;
      } else {
        initialWidth = computedWidth;
        initialHeight = computedWidth / sideFileAspectRatio;
        initialTop = (computedHeight - initialHeight) / 2;
      }
    } else if (sideFitMode === 'fill') {
      if (productAspectRatio > sideFileAspectRatio) {
        initialWidth = computedWidth;
        initialHeight = computedWidth / sideFileAspectRatio;
        initialTop = (computedHeight - initialHeight) / 2;
      } else {
        initialWidth = computedHeight * sideFileAspectRatio;
        initialHeight = computedHeight;
        initialLeft = (computedWidth - initialWidth) / 2;
      }
    }

    return {
      left: initialLeft,
      top: initialTop,
      width: initialWidth,
      height: initialHeight
    };
  };

  const interactionRef = React.useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
    startHeight: number;
    action: string | null;
  }>({
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    startWidth: 0,
    startHeight: 0,
    action: null
  });

  const handlePointerDown = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    action: string,
    side: 'front' | 'back'
  ) => {
    e.stopPropagation();
    onActiveFocusedSideChange(side);
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const sideProps = getManualProps(side);

    let currentL = sideProps.left;
    let currentT = sideProps.top;
    let currentW = sideProps.width;
    let currentH = sideProps.height;

    if (!sideProps.isActive) {
      const bounds = getInitialBounds(side);
      currentL = bounds.left;
      currentT = bounds.top;
      currentW = bounds.width;
      currentH = bounds.height;
      
      if (side === 'front') {
        setFrontManualLeft(currentL);
        setFrontManualTop(currentT);
        setFrontManualWidth(currentW);
        setFrontManualHeight(currentH);
        setIsFrontManualActive(true);
      } else {
        setBackManualLeft(currentL);
        setBackManualTop(currentT);
        setBackManualWidth(currentW);
        setBackManualHeight(currentH);
        setIsBackManualActive(true);
      }
    }

    interactionRef.current = {
      startX: clientX,
      startY: clientY,
      startLeft: currentL,
      startTop: currentT,
      startWidth: currentW,
      startHeight: currentH,
      action: action
    };

    const handlePointerMove = (moveEvent: MouseEvent | TouchEvent) => {
      const moveX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const deltaX = moveX - interactionRef.current.startX;
      const deltaY = moveY - interactionRef.current.startY;

      const { action: currentAction, startLeft, startTop, startWidth, startHeight } = interactionRef.current;

      if (!currentAction) return;

      if (currentAction === 'move') {
        if (side === 'front') {
          setFrontManualLeft(startLeft + deltaX);
          setFrontManualTop(startTop + deltaY);
        } else {
          setBackManualLeft(startLeft + deltaX);
          setBackManualTop(startTop + deltaY);
        }
      } else {
        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = startLeft;
        let newTop = startTop;

        const minSize = 20;

        const pw = side === 'front' ? pixelWidth : (backPixelWidth || pixelWidth);
        const ph = side === 'front' ? pixelHeight : (backPixelHeight || pixelHeight);
        const baseAspect = (pw && ph) ? (pw / ph) : productAspectRatio;
        const sideRotation = side === 'front' ? frontRotationDegrees : backRotationDegrees;
        const isRotatedRot = sideRotation % 180 !== 0;
        const imageAspect = isRotatedRot ? (1 / baseAspect) : baseAspect;

        const shiftPressed = moveEvent.shiftKey;
        // Keep aspect ratio by default, unless allowDistortion is toggled OR Shift is held.
        // If allowDistortion is true, Shift reverses it back to keep aspect ratio.
        const keepAspect = allowDistortion ? shiftPressed : !shiftPressed;

        if (keepAspect) {
          if (currentAction === 'resize-br') {
            newWidth = Math.max(minSize, startWidth + deltaX);
            newHeight = newWidth / imageAspect;
            if (newHeight < minSize) {
              newHeight = minSize;
              newWidth = newHeight * imageAspect;
            }
          } else if (currentAction === 'resize-bl') {
            newWidth = Math.max(minSize, startWidth - deltaX);
            newHeight = newWidth / imageAspect;
            if (newHeight < minSize) {
              newHeight = minSize;
              newWidth = newHeight * imageAspect;
            }
            newLeft = startLeft + (startWidth - newWidth);
          } else if (currentAction === 'resize-tr') {
            newWidth = Math.max(minSize, startWidth + deltaX);
            newHeight = newWidth / imageAspect;
            if (newHeight < minSize) {
              newHeight = minSize;
              newWidth = newHeight * imageAspect;
            }
            newTop = startTop + (startHeight - newHeight);
          } else if (currentAction === 'resize-tl') {
            newWidth = Math.max(minSize, startWidth - deltaX);
            newHeight = newWidth / imageAspect;
            if (newHeight < minSize) {
              newHeight = minSize;
              newWidth = newHeight * imageAspect;
            }
            newLeft = startLeft + (startWidth - newWidth);
            newTop = startTop + (startHeight - newHeight);
          }
        } else {
          if (currentAction.includes('r')) {
            newWidth = Math.max(minSize, startWidth + deltaX);
          }
          if (currentAction.includes('l')) {
            const potentialWidth = startWidth - deltaX;
            if (potentialWidth >= minSize) {
              newWidth = potentialWidth;
              newLeft = startLeft + deltaX;
            }
          }
          if (currentAction.includes('b')) {
            newHeight = Math.max(minSize, startHeight + deltaY);
          }
          if (currentAction.includes('t')) {
            const potentialHeight = startHeight - deltaY;
            if (potentialHeight >= minSize) {
              newHeight = potentialHeight;
              newTop = startTop + deltaY;
            }
          }
        }

        if (side === 'front') {
          setFrontManualWidth(newWidth);
          setFrontManualHeight(newHeight);
          setFrontManualLeft(newLeft);
          setFrontManualTop(newTop);
        } else {
          setBackManualWidth(newWidth);
          setBackManualHeight(newHeight);
          setBackManualLeft(newLeft);
          setBackManualTop(newTop);
        }
      }
    };

    const handlePointerUp = () => {
      document.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('mouseup', handlePointerUp);
      document.removeEventListener('touchmove', handlePointerMove);
      document.removeEventListener('touchend', handlePointerUp);
      interactionRef.current.action = null;
    };

    document.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('mouseup', handlePointerUp);
    document.addEventListener('touchmove', handlePointerMove, { passive: false });
    document.addEventListener('touchend', handlePointerUp);
  };

  // Canvas Drag & Drop Listeners
  const handleDragOver = (e: React.DragEvent, side: 'front' | 'back') => {
    e.preventDefault();
    e.stopPropagation();
    if (side === 'front') {
      setIsFrontDragOver(true);
    } else {
      setIsBackDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent, side: 'front' | 'back') => {
    e.preventDefault();
    if (side === 'front') {
      setIsFrontDragOver(false);
    } else {
      setIsBackDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent, side: 'front' | 'back') => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsFrontDragOver(false);
    setIsBackDragOver(false);

    // 1. Check if it's a PDF page from our gallery pool
    const type = e.dataTransfer.getData('type');
    const pageIndexStr = e.dataTransfer.getData('pageIndex');

    if (type === 'pdfPage' && pageIndexStr !== '') {
      const idx = parseInt(pageIndexStr, 10);
      if (onDropPdfPage) {
        onDropPdfPage(idx, side);
      }
    } 
    // 2. Otherwise handle normal system local files dropping
    else if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (onDropLocalFile) {
        onDropLocalFile(file, side);
      }
    }
  };

  // Helper layout rendering the inner content of a canvas artboard
  const renderArtboardContent = (side: 'front' | 'back', srcUrl: string | null, label: string) => {
    const isDragOver = side === 'front' ? isFrontDragOver : isBackDragOver;
    const isFocused = side === activeFocusedSide;
    const sideProps = getManualProps(side);

    const activeImageStyle: React.CSSProperties = sideProps.isActive ? {
      position: 'absolute',
      left: `${sideProps.left}px`,
      top: `${sideProps.top}px`,
      width: `${sideProps.width}px`,
      height: `${sideProps.height}px`,
      transform: `rotate(${sideProps.rotation}deg)`,
    } : {
      width: '100%',
      height: '100%',
      transform: `rotate(${sideProps.rotation}deg)`,
      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    };

    const getImageClass = () => {
      if (sideProps.isActive) {
        return "absolute object-fill pointer-events-none select-none max-w-none max-h-none";
      }
      switch (sideProps.fitMode) {
        case 'fit':
          return 'object-contain w-full h-full';
        case 'fill':
          return 'object-cover w-full h-full';
        case 'stretch':
          return 'w-full h-full object-fill';
        default:
          return 'object-contain w-full h-full';
      }
    };

    return (
      <div 
        onMouseDown={(e) => {
          if (!srcUrl) {
            handleEmptySlotClick(side);
          } else {
            onActiveFocusedSideChange(side);
          }
        }}
        onTouchStart={(e) => {
          if (!srcUrl) {
            handleEmptySlotClick(side);
          } else {
            onActiveFocusedSideChange(side);
          }
        }}
        onDragEnter={(e) => handleDragOver(e, side)}
        onDragOver={(e) => handleDragOver(e, side)}
        onDragLeave={(e) => handleDragLeave(e, side)}
        onDrop={(e) => handleDrop(e, side)}
        style={previewBoxStyle} 
        className={`bg-white border rounded-lg shadow-2xl relative overflow-hidden transition-all duration-300 flex items-center justify-center animate-fade-in cursor-pointer group/artboard ${
          isDragOver 
            ? 'border-blue-500 ring-4 ring-blue-500/30 ring-inset scale-[0.98]' 
            : isFocused && isDouble
              ? 'border-blue-500 ring-2 ring-blue-500/50 scale-[1.01]'
              : 'border-slate-800 hover:border-blue-500/50'
        }`}
      >
        {srcUrl ? (
          <>
            <img
              src={srcUrl}
              alt={`${label} preview`}
              style={activeImageStyle}
              className={getImageClass()}
              referrerPolicy="no-referrer"
            />

            <span className="absolute top-2.5 right-2.5 bg-blue-700/95 border border-blue-650/50 text-white font-mono text-[8px] font-black px-2 py-0.5 rounded-sm tracking-widest uppercase z-20 shadow-md">
              {label} {isFocused && isDouble && '(Geselecteerd)'}
            </span>

            {onClearFile && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearFile(side);
                }}
                className="absolute top-2.5 left-2.5 bg-rose-600 hover:bg-rose-500 text-white p-1.5 rounded-lg z-30 shadow-md cursor-pointer transition-colors border border-rose-500/30 flex items-center justify-center hover:scale-105 active:scale-95"
                title={`Verwijder ${side === 'front' ? 'voorzijde' : 'achterzijde'} voorbeeld (of druk op Delete)`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            
            {/* Draggables Overlap */}
            <div 
              className="absolute inset-0 pointer-events-auto"
              style={{ borderRadius: borderRadiusStyle }}
            >
              {sideProps.isActive ? (
                <div
                  style={{
                    position: 'absolute',
                    left: `${sideProps.left}px`,
                    top: `${sideProps.top}px`,
                    width: `${sideProps.width}px`,
                    height: `${sideProps.height}px`,
                  }}
                  className="border-2 border-blue-500/80 pointer-events-auto"
                >
                  <div
                    onMouseDown={(e) => handlePointerDown(e, 'move', side)}
                    onTouchStart={(e) => handlePointerDown(e, 'move', side)}
                    className="absolute inset-0 cursor-move bg-blue-500/5 hover:bg-blue-500/10 transition-colors"
                  />
                  {/* Resizers */}
                  <div onMouseDown={(e) => handlePointerDown(e, 'resize-tl', side)} onTouchStart={(e) => handlePointerDown(e, 'resize-tl', side)} className="resize-handle absolute -top-1.5 -left-1.5 w-3 h-3 bg-blue-600 rounded-full border border-white cursor-nwse-resize shadow-md" />
                  <div onMouseDown={(e) => handlePointerDown(e, 'resize-tr', side)} onTouchStart={(e) => handlePointerDown(e, 'resize-tr', side)} className="resize-handle absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-600 rounded-full border border-white cursor-nesw-resize shadow-md" />
                  <div onMouseDown={(e) => handlePointerDown(e, 'resize-bl', side)} onTouchStart={(e) => handlePointerDown(e, 'resize-bl', side)} className="resize-handle absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-blue-600 rounded-full border border-white cursor-nesw-resize shadow-md" />
                  <div onMouseDown={(e) => handlePointerDown(e, 'resize-br', side)} onTouchStart={(e) => handlePointerDown(e, 'resize-br', side)} className="resize-handle absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-600 rounded-full border border-white cursor-nwse-resize shadow-md" />
                </div>
              ) : (
                <div
                  onMouseDown={(e) => handlePointerDown(e, 'move', side)}
                  onTouchStart={(e) => handlePointerDown(e, 'move', side)}
                  className="absolute inset-0 cursor-move bg-slate-900/0 hover:bg-slate-900/10 transition-colors flex items-center justify-center group/dragprompt"
                >
                  <div className="bg-slate-950/80 backdrop-blur-xs border border-slate-700/50 px-2.5 py-1 rounded-md text-white text-[9px] font-bold opacity-0 group-hover/dragprompt:opacity-100 transition-opacity flex items-center gap-1 shadow-md">
                    <Scale className="w-3 h-3 text-blue-400" />
                    <span>Versleep om handmatig te herschalen</span>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* High-Fidelity Blank State Frame with Click-to-Upload */
          <div className="p-5 w-full h-full text-slate-400 flex flex-col justify-between absolute inset-0 bg-slate-950 select-none relative group/blank transition-colors duration-200 hover:bg-slate-950/90">
            <div className="space-y-1 text-left">
              <div className="h-1.5 w-7 bg-blue-600 rounded-xs"></div>
              <h4 className="text-[11px] font-black tracking-tight uppercase leading-none text-slate-100">
                {label} Slot
              </h4>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                Slepen of klikken om te uploaden
              </p>
            </div>

            <div className="my-auto self-center flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 border border-dashed border-slate-800 group-hover/blank:border-blue-500 rounded-full flex items-center justify-center relative bg-slate-900/40 transition-colors duration-200">
                <UploadCloud className="w-6 h-6 text-slate-600 group-hover/blank:text-blue-400 transition-colors duration-200" />
              </div>
              <span className="px-3 py-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-600 text-white font-bold text-[10px] tracking-tight transition-all shadow-md group-hover/blank:scale-105 active:scale-95 cursor-pointer">
                Kies bestand
              </span>
            </div>

            <div className="text-[8px] font-mono text-slate-600 flex items-center justify-between w-full pt-2 border-t border-slate-900">
              <span>CANVAS MONITOR</span>
              <span className="animate-pulse text-slate-500">Wacht op bestand...</span>
            </div>
          </div>
        )}

        {/* Drag Over Highlight Overlay text */}
        {isDragOver && (
          <div className="absolute inset-0 bg-blue-700/80 backdrop-blur-xs flex flex-col items-center justify-center text-white p-3 text-center pointer-events-none z-30 animate-fade-in select-none">
            <UploadCloud className="w-10 h-10 text-white animate-bounce mb-2" />
            <span className="font-extrabold text-[11px] tracking-tight">Laat los om te laden op {side === 'front' ? 'Voorzijde' : 'Achterzijde'}</span>
            <span className="text-[9px] text-blue-100 mt-1">Slepen van PDF-pagina of lokaal bestand</span>
          </div>
        )}

        {/* Interactive Print Guidelines (Trim and Safety Margins) */}
        {showGuidelines && (
          <>
            <div 
              style={{ borderRadius: borderRadiusStyle }}
              className="absolute inset-0 border border-red-500/60 pointer-events-none select-none z-10"
            >
              <span className="absolute left-1 top-1 bg-red-600 text-white font-bold text-[6px] px-1 rounded-xs tracking-wide">
                Bleed Limit (3mm)
              </span>
            </div>

            <div 
              style={{ borderRadius: innerCropStyle }}
              className="absolute inset-[4px] border border-dashed border-blue-500/50 pointer-events-none select-none z-10"
            >
              <span className="absolute right-1 bottom-1 bg-blue-600 text-white font-bold text-[6px] px-1 rounded-xs">
                Trim Cut Line
              </span>
            </div>

            <div 
              style={{ borderRadius: innerCropStyle }}
              className="absolute inset-[10px] border border-dotted border-emerald-500/50 pointer-events-none select-none z-10"
            >
              <span className="absolute left-1 bottom-[10%] bg-emerald-600 text-white font-bold text-[6px] px-1 rounded-xs">
                Safe zone
              </span>
            </div>
          </>
        )}

        {/* Realistic Output rendering */}
        {isPreviewMode && srcUrl && (
          <>
            <div style={{ borderRadius: innerCropStyle }} className="absolute inset-0 border-[4px] border-slate-950 pointer-events-none z-20" />
            <div style={{ borderRadius: innerCropStyle }} className="absolute inset-[4px] pointer-events-none bg-gradient-to-tr from-white/0 via-white/5 to-white/10 mix-blend-overlay z-20 shadow-inner" />
          </>
        )}
      </div>
    );
  };

  const renderMonitorContent = () => {
    const isSideManualActive = activeFocusedSide === 'front' ? isFrontManualActive : isBackManualActive;

    return (
      <div className="space-y-4">
        {/* Header controls inside dark stage */}
        <div className="flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="text-xs font-bold font-sans uppercase tracking-widest text-slate-300">
              {isMaximized ? 'Volledig Scherm Pre-flight Monitor' : 'Pre-flight Canvas Monitor'}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isMaximized ? (
              <button
                type="button"
                onClick={() => setIsMaximized(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border border-rose-500/30"
                style={{ borderColor: '#d50e0e', backgroundColor: '#314158' }}
                title="Klik hier of druk op Esc om terug te gaan naar de gewone pagina"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Standaard weergave</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsMaximized(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 flex items-center gap-1.5 transition-all shadow-xs border border-slate-700 cursor-pointer"
                style={{ borderColor: '#d50e0e', backgroundColor: '#314158' }}
                title="Klik hier om de monitor in een vergroot overzicht te bekijken"
              >
                <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Vergrootte weergave</span>
              </button>
            )}

            {isSideManualActive && (
              <button
                onClick={() => {
                  if (activeFocusedSide === 'front') {
                    setIsFrontManualActive(false);
                  } else {
                    setIsBackManualActive(false);
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 flex items-center gap-1 hover:bg-amber-400 cursor-pointer shadow-xs transition-transform hover:scale-[1.02] active:scale-[0.98]"
                title="Herstel handmatige schaling voor de geselecteerde zijde"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Herstel Schaal ({activeFocusedSide === 'front' ? 'Voor' : 'Achter'})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setAllowDistortion(!allowDistortion)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                allowDistortion
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-xs border border-amber-500/30'
                  : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
              }`}
              title="Klik om de afbeelding vrij te vervormen. U kunt ook de Shift-toets ingedrukt houden tijdens het slepen om de verhouding vrij aan te passen."
            >
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <span>{allowDistortion ? 'Vrij vervormen: AAN' : 'Verhouding behouden'}</span>
            </button>

            <button
              onClick={() => {
                setIsPreviewMode(!isPreviewMode);
                setShowGuidelines(isPreviewMode);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                isPreviewMode
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs scale-[1.02]'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
              title="Wissel naar realistisch drukvoorbeeld zonder technische lijnen"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isPreviewMode ? 'Hulplijnen' : 'Toon Eindresultaat'}</span>
            </button>

            {!isPreviewMode && (
              <button
                onClick={() => setShowGuidelines(!showGuidelines)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  showGuidelines
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showGuidelines ? 'Hulplijnen Aan' : 'Geen Lijnen'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Visual Canvas Stage */}
        <div 
          style={{ height: '500.067px', backgroundColor: '#dedede' }}
          className="rounded-xl p-5 border border-slate-300 flex flex-col items-center justify-center relative overflow-hidden group select-none"
        >
          
          {/* Soft background grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#cbd5e1_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e1_1px,transparent_1px)] bg-[size:16px_16px] opacity-25 pointer-events-none"></div>

          {/* Outer scale reference dimensions */}
          <div className="w-full flex items-center justify-between text-[9px] font-mono text-slate-700 font-bold tracking-wider uppercase select-none mb-4">
            <span>FORMAAT: {widthMm} × {heightMm} mm ({isLandscape ? 'Liggend' : 'Staand'})</span>
            <span>{isDouble ? 'DUBBELZIJDIG' : 'ENKELZIJDIG'}</span>
          </div>
          {/* Conditionally render 1 artboard or 2 artboards stacked vertically */}
          {!isDouble ? (
            /* SINGLE SIDED: Center Artboard */
            <div className="my-2">
              {renderArtboardContent('front', imageSrcUrl, 'Voorzijde')}
            </div>
          ) : (
            /* DOUBLE SIDED: Stacked Vertical Layout for maximum space and clarity */
            <div className="flex flex-col items-center justify-center gap-8 w-full py-4 relative">
              <div className="flex flex-col items-center space-y-3 w-full">
                <span className={`text-xs font-black tracking-widest uppercase px-3 py-1 rounded transition-colors ${activeFocusedSide === 'front' ? 'text-blue-800 bg-blue-100 border border-blue-300' : 'text-slate-600'}`}>
                  A-Zijde: Voorkant {activeFocusedSide === 'front' && '●'}
                </span>
                {renderArtboardContent('front', imageSrcUrl, 'Voorkant')}
              </div>

              {onSwapSides && (
                <div className="flex items-center justify-center my-2">
                  <button
                    type="button"
                    onClick={onSwapSides}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 shadow-md cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 group"
                    title="Wissel de voorkant en achterkant van plaats"
                  >
                    <ArrowLeftRight className="w-4 h-4 transition-transform group-hover:rotate-180 duration-500 text-blue-400" />
                    <span className="text-[11px] font-extrabold px-1">Wissel voorzijde & achterzijde</span>
                  </button>
                </div>
              )}

              <div className="flex flex-col items-center space-y-3 w-full">
                <span className={`text-xs font-black tracking-widest uppercase px-3 py-1 rounded transition-colors ${activeFocusedSide === 'back' ? 'text-blue-800 bg-blue-100 border border-blue-300' : 'text-slate-600'}`}>
                  B-Zijde: Achterkant {activeFocusedSide === 'back' && '●'}
                </span>
                {renderArtboardContent('back', backImageSrcUrl, 'Achterkant')}
              </div>
            </div>
          )}

          {/* Hidden HTML Inputs for Direct Click Upload on Canvas */}
          <input
            type="file"
            ref={frontInputRef}
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => {
              if (e.target.files && e.target.files[0] && onDropLocalFile) {
                onDropLocalFile(e.target.files[0], 'front');
              }
            }}
            className="hidden"
          />
          <input
            type="file"
            ref={backInputRef}
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => {
              if (e.target.files && e.target.files[0] && onDropLocalFile) {
                onDropLocalFile(e.target.files[0], 'back');
              }
            }}
            className="hidden"
          />
        </div>

        {/* Guide details / spec list */}
        <div className="grid grid-cols-2 gap-3 pt-1 text-xs select-none">
          <div className="bg-slate-950 p-2 border border-slate-850 flex items-center gap-2 rounded-xl">
            <div className="w-4 h-4 rounded-xs border-2 border-red-500/60 flex-shrink-0"></div>
            <div>
              <div className="font-bold text-slate-300">Afloop (3mm Bleed)</div>
              <div className="text-[9px] text-slate-500 leading-none">Achtergrond moet hierdoor lopen</div>
            </div>
          </div>

          <div className="bg-slate-950 p-2 border border-slate-850 flex items-center gap-2 rounded-xl">
            <div className="w-4 h-4 rounded-xs border border-dashed border-blue-500/60 flex-shrink-0"></div>
            <div>
              <div className="font-bold text-slate-300">Tekstveilig katern</div>
              <div className="text-[9px] text-slate-550 leading-none">Belangrijke logo/tekst binnenzone</div>
            </div>
          </div>
        </div>

        {/* PDF Pages Draggable Gallery Pool */}
        {pdfPages && pdfPages.length > 0 && (
          <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-slate-350">
                  Gedetecteerde PDF Pagina's ({pdfPages.length}) - Sleep naar de frames
                </span>
              </div>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wide px-2 py-0.5 rounded-sm bg-slate-900 border border-slate-800">
                DRAG-TO-CANVAS
              </span>
            </div>
            
            <div className="flex gap-3 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-800">
              {pdfPages.map((page, idx) => {
                const isAssignedFront = selectedFrontPageIdx === idx;
                const isAssignedBack = selectedBackPageIdx === idx && isDouble;
                
                return (
                  <div
                    key={idx}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('type', 'pdfPage');
                      e.dataTransfer.setData('pageIndex', String(idx));
                    }}
                    className={`p-2 rounded-xl border text-center flex-shrink-0 w-24 transition-all duration-150 cursor-grab active:cursor-grabbing select-none relative ${
                      isAssignedFront
                        ? 'border-blue-600 bg-blue-950/20 shadow-xs'
                        : isAssignedBack
                          ? 'border-emerald-600 bg-emerald-950/20 shadow-xs'
                          : 'border-slate-850 bg-slate-900/60 hover:border-slate-750'
                    }`}
                  >
                    <div className="w-full bg-white rounded-md overflow-hidden flex items-center justify-center p-0.5 border border-slate-800 h-20 relative">
                      <img
                        src={page.dataUrl}
                        alt={`Page ${idx + 1}`}
                        className="max-w-full max-h-full object-contain pointer-events-none"
                      />
                      <span className="absolute bottom-1 right-1 bg-slate-950/80 text-white font-mono text-[8px] font-black px-1.5 py-0.5 rounded-sm leading-none">
                        p. {idx + 1}
                      </span>
                    </div>
                    
                    <div className="mt-2 space-y-1">
                      <button
                        type="button"
                        onClick={() => onSelectFrontPageIdx && onSelectFrontPageIdx(idx, 'front')}
                        className={`w-full py-1 rounded text-[9px] font-extrabold cursor-pointer transition-colors ${
                          isAssignedFront
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-slate-800 text-slate-350 hover:bg-slate-750 hover:text-white'
                        }`}
                      >
                        {isAssignedFront ? '✓ Voorkant' : 'Voorzijde'}
                      </button>
                      {isDouble && (
                        <button
                          type="button"
                          onClick={() => onSelectBackPageIdx && onSelectBackPageIdx(idx)}
                          className={`w-full py-1 rounded text-[9px] font-extrabold cursor-pointer transition-colors ${
                            isAssignedBack
                              ? 'bg-emerald-600 text-white font-bold'
                              : 'bg-slate-800 text-slate-350 hover:bg-slate-750 hover:text-white'
                          }`}
                        >
                          {isAssignedBack ? '✓ Achterkant' : 'Achterzijde'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Fit to Page & Scale Controls (Integrated directly in Preflight Canvas Monitor) */}
        <div className="pt-4 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Aanpassingsmodus (Fit To Page) {isDouble && `(${activeFocusedSide === 'front' ? 'Voorkant' : 'Achterkant'})`}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-semibold font-sans">Pre-press automatische schaling</span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {[
              { id: 'fit', label: 'Inpassen (Fit)', desc: 'Houdt verhouding, voegt witte marges toe' },
              { id: 'fill', label: 'Vullend (Crop)', desc: 'Vult hele kader, snijdt overloop af' },
              { id: 'stretch', label: 'Vervormen', desc: 'Trekt beeld geforceerd passend' }
            ].map((mode) => {
              const active = (activeFocusedSide === 'front' ? frontFitMode : backFitMode) === mode.id && !isSideManualActive;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    if (activeFocusedSide === 'front') {
                      onSetFrontFitMode(mode.id as FitMode);
                      setIsFrontManualActive(false);
                    } else {
                      onSetBackFitMode(mode.id as FitMode);
                      setIsBackManualActive(false);
                    }
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] ${
                    active
                      ? 'border-blue-600 bg-blue-600/10 text-white font-bold shadow-xs'
                      : 'border-slate-800 bg-slate-950 text-slate-450 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 w-full mb-1">
                    <span className="text-[11px] font-bold tracking-tight">
                      {mode.label}
                    </span>
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${active ? 'border-blue-500 bg-blue-500' : 'border-slate-700 bg-slate-950'}`}>
                      {active && <span className="text-[8px] text-white">✓</span>}
                    </div>
                  </div>
                  <p className="text-[9px] leading-tight text-slate-500 font-medium font-sans">
                    {mode.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  if (isMaximized) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md overflow-y-auto p-4 md:p-8 flex items-center justify-center animate-fade-in shadow-2xl">
        <div className="w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl relative my-auto text-white">
          {renderMonitorContent()}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 text-white shadow-lg space-y-4">
      {renderMonitorContent()}
    </div>
  );
}
