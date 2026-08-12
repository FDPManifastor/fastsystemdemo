/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PrintProduct {
  id: string;
  name: string;
  category: 'Flyer' | 'Poster' | 'Sticker' | 'Banner' | 'Visitekaart';
  widthMm: number;
  heightMm: number;
  iconName: 'file-text' | 'image' | 'sticker' | 'map' | 'rectangle-horizontal';
  description?: string;
}

export type FitMode = 'fit' | 'stretch' | 'fill';
export type StickerShape = 'rectangle' | 'circle' | 'oval' | 'die-cut';

export interface FileAnalysis {
  fileName: string;
  fileSize: number;
  fileType: string;
  pixelWidth: number;
  pixelHeight: number;
  computedDpi: number;
  aspectRatioOk: boolean;
  dpiOk: boolean;
  colorSpace: 'RGB' | 'CMYK' | 'Grayscale';
  hasBleed: boolean;
  feedbackState: 'success' | 'warning' | 'error';
  errorMessage?: string;
  warningMessage?: string;
  successMessage?: string;
  
  // Optional double-sided extra metrics
  backFileName?: string;
  backFileSize?: number;
  backPixelWidth?: number;
  backPixelHeight?: number;
  backComputedDpi?: number;
  backDpiOk?: boolean;
}

export type PrototypeStateOverride = 'auto' | 'success' | 'warning' | 'error';
