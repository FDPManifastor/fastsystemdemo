/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { 
  CheckCircle, 
  Printer, 
  Scale, 
  Layers, 
  RefreshCw, 
  Sparkles,
  Send,
  X,
  Lock,
  Key,
  Database,
  Download,
  Search,
  Filter,
  User,
  Mail,
  Phone,
  Clock,
  Trash2,
  FileDown,
  FolderOpen,
  Briefcase,
  Eye,
  Copy,
  ExternalLink,
  AlertTriangle,
  CheckSquare,
  Square,
  Scissors,
  Grid,
  Users,
  PlusCircle
} from 'lucide-react';

import { PrintProduct, FileAnalysis, FitMode, PrototypeStateOverride, StickerShape } from './types';
import ProductSelector, { ProductCategorySelector, ProductFormatSelector } from './components/ProductSelector';
import UploadDropzone from './components/UploadDropzone';
import FeedbackPanel from './components/FeedbackPanel';
import LiveFilePreview from './components/LiveFilePreview';
import { FDLogo } from './components/FDLogo';
import { renderPdfFile } from './utils/pdfLoader';

const STANDARD_PRODUCTS: PrintProduct[] = [
  // Flyers
  { id: 'a4-flyer', name: 'A4 Flyer', category: 'Flyer', widthMm: 210, heightMm: 297, iconName: 'file-text' },
  { id: 'a5-flyer', name: 'A5 Flyer', category: 'Flyer', widthMm: 148, heightMm: 210, iconName: 'file-text' },
  { id: 'a6-flyer', name: 'A6 Flyer', category: 'Flyer', widthMm: 105, heightMm: 148, iconName: 'file-text' },
  { id: 'a7-flyer', name: 'A7 Flyer', category: 'Flyer', widthMm: 74, heightMm: 105, iconName: 'file-text' },
  
  // Posters
  { id: 'a3-poster', name: 'A3 Poster', category: 'Poster', widthMm: 297, heightMm: 420, iconName: 'image' },
  { id: 'a2-poster', name: 'A2 Poster', category: 'Poster', widthMm: 420, heightMm: 594, iconName: 'image' },
  { id: 'a1-poster', name: 'A1 Poster', category: 'Poster', widthMm: 594, heightMm: 841, iconName: 'image' },
  { id: 'a0-poster', name: 'A0 Poster', category: 'Poster', widthMm: 841, heightMm: 1189, iconName: 'image' },
  
  // Stickers
  { id: 'vinyl-sticker-pocket', name: 'Vinyl Sticker (Eigen formaat)', category: 'Sticker', widthMm: 80, heightMm: 80, iconName: 'sticker' },
  
  // Visitekaarten
  { id: 'visitekaart-standard', name: 'Visitekaart (Standaard)', category: 'Visitekaart', widthMm: 85, heightMm: 55, iconName: 'rectangle-horizontal' },
  
  // Banners
  { id: 'rollup-banner', name: 'Rollup Banner', category: 'Banner', widthMm: 850, heightMm: 2000, iconName: 'file-text' },
];

const calculateGridConfig = (
  usableW: number,
  usableH: number,
  itemW: number,
  itemH: number,
  gutter: number
) => {
  // Standard layout (Items positioned with w x h)
  const colsStraight = Math.floor((usableW + gutter) / (itemW + gutter));
  const rowsStraight = Math.floor((usableH + gutter) / (itemH + gutter));
  const totalStraight = Math.max(0, colsStraight) * Math.max(0, rowsStraight);

  // Rotated layout (Items rotated 90 degrees as h x w)
  const colsRotated = Math.floor((usableW + gutter) / (itemH + gutter));
  const rowsRotated = Math.floor((usableH + gutter) / (itemW + gutter));
  const totalRotated = Math.max(0, colsRotated) * Math.max(0, rowsRotated);

  if (totalRotated > totalStraight && totalRotated > 0) {
    return {
      cols: colsRotated,
      rows: rowsRotated,
      isRotated: true,
      count: totalRotated
    };
  } else {
    return {
      cols: Math.max(0, colsStraight),
      rows: Math.max(0, rowsStraight),
      isRotated: false,
      count: totalStraight
    };
  }
};

export default function App() {
  const [selectedProduct, setSelectedProduct] = useState<PrintProduct>(STANDARD_PRODUCTS[0]);
  const [customWidth, setCustomWidth] = useState<number>(STANDARD_PRODUCTS[0].widthMm);
  const [customHeight, setCustomHeight] = useState<number>(STANDARD_PRODUCTS[0].heightMm);
  
  // Sticker Custom parameters
  const [stickerShape, setStickerShape] = useState<StickerShape>('rectangle');

  // Printing Side Option (Single vs Double sided)
  const [printSides, setPrintSides] = useState<'single' | 'double'>('single');

  // File Upload State
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [backActiveFile, setBackActiveFile] = useState<File | null>(null);
  const [filePixelWidth, setFilePixelWidth] = useState<number>(0);
  const [filePixelHeight, setFilePixelHeight] = useState<number>(0);
  const [backFilePixelWidth, setBackFilePixelWidth] = useState<number>(0);
  const [backFilePixelHeight, setBackFilePixelHeight] = useState<number>(0);
  const [imageSrcUrl, setImageSrcUrl] = useState<string | null>(null);
  const [backImageSrcUrl, setBackImageSrcUrl] = useState<string | null>(null);

  // PDF page renderer pool to choose which pages of PDF goes where
  const [pdfPages, setPdfPages] = useState<{ dataUrl: string; width: number; height: number; filename?: string }[]>([]);
  const [selectedFrontPageIdx, setSelectedFrontPageIdx] = useState<number>(0);
  const [selectedBackPageIdx, setSelectedBackPageIdx] = useState<number>(1);

  // Correction and Customization Actions - Split for front and back
  const [frontFitMode, setFrontFitMode] = useState<FitMode>('fill');
  const [backFitMode, setBackFitMode] = useState<FitMode>('fill');
  const [frontRotationDegrees, setFrontRotationDegrees] = useState<number>(0);
  const [backRotationDegrees, setBackRotationDegrees] = useState<number>(0);
  const [activeFocusedSide, setActiveFocusedSide] = useState<'front' | 'back'>('front');
  const [proceedAnywayAlert, setProceedAnywayAlert] = useState<boolean>(false);
  const [showOrderSuccessModal, setShowOrderSuccessModal] = useState<boolean>(false);

  // Prototype UI Override Sandbox Sandbox
  const [prototypeOverride, setPrototypeOverride] = useState<PrototypeStateOverride>('auto');

  // New Full-Stack Backoffice & Customer Details states
  const [activePortal, setActivePortal] = useState<'landing' | 'client' | 'admin'>('landing');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('fd_admin_authed') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [adminCategoryFilter, setAdminCategoryFilter] = useState<string>('All');
  const [adminSubTab, setAdminSubTab] = useState<'files' | 'orders' | 'staff' | 'create_order'>('files');
  const [selectedFileKeys, setSelectedFileKeys] = useState<string[]>([]);
  const [previewFile, setPreviewFile] = useState<any | null>(null);

  // Real-time status tracking & portal states
  const [trackedOrderId, setTrackedOrderId] = useState<string | null>(null);
  const [trackedOrder, setTrackedOrder] = useState<any | null>(null);
  const [isLoadingTrackedOrder, setIsLoadingTrackedOrder] = useState<boolean>(false);
  const [adminStatusInputs, setAdminStatusInputs] = useState<Record<string, { status: string; note: string }>>({});
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<Record<string, boolean>>({});
  const [customerUploadedImage, setCustomerUploadedImage] = useState<string | null>(null);
  const [customerUploadedFileName, setCustomerUploadedFileName] = useState<string>('');
  const [customerUploadedDpi, setCustomerUploadedDpi] = useState<number>(300);
  const [customerUploadedPixels, setCustomerUploadedPixels] = useState<{w: number, h: number}>({w: 0, h: 0});
  const [customerUploadSide, setCustomerUploadSide] = useState<'front' | 'back'>('front');
  const [isUploadingCustomerFile, setIsUploadingCustomerFile] = useState<boolean>(false);

  // PDF configuration and imposition engine states
  const [pdfLayoutMode, setPdfLayoutMode] = useState<'single' | 'sra3'>('single');
  const [pdfWithCropMarks, setPdfWithCropMarks] = useState<boolean>(true);
  const [pdfBleedMm, setPdfBleedMm] = useState<number>(2);
  const [pdfGutterMm, setPdfGutterMm] = useState<number>(2);
  const [pdfSra3Orientation, setPdfSra3Orientation] = useState<'auto' | 'landscape' | 'portrait'>('auto');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  // Memoized SRA3 Pre-Press calculations
  const sra3Layout = useMemo(() => {
    if (!previewFile) return null;
    const trimW = Number(previewFile.order.customWidth) || 210;
    const trimH = Number(previewFile.order.customHeight) || 297;
    
    const sra3W = 450;
    const sra3H = 320;
    const sheetMargin = 3;
    const usableW = sra3W - 2 * sheetMargin;
    const usableH = sra3H - 2 * sheetMargin;

    const fitLandscape = calculateGridConfig(usableW, usableH, trimW, trimH, pdfGutterMm);
    const fitPortrait = calculateGridConfig(usableH, usableW, trimW, trimH, pdfGutterMm);

    let bestOrientation: 'landscape' | 'portrait' = 'landscape';
    let finalCols = fitLandscape.cols;
    let finalRows = fitLandscape.rows;
    let finalRotated = fitLandscape.isRotated;

    if (pdfSra3Orientation === 'landscape') {
      bestOrientation = 'landscape';
      finalCols = fitLandscape.cols;
      finalRows = fitLandscape.rows;
      finalRotated = fitLandscape.isRotated;
    } else if (pdfSra3Orientation === 'portrait') {
      bestOrientation = 'portrait';
      finalCols = fitPortrait.cols;
      finalRows = fitPortrait.rows;
      finalRotated = fitPortrait.isRotated;
    } else {
      const countLandscape = fitLandscape.cols * fitLandscape.rows;
      const countPortrait = fitPortrait.cols * fitPortrait.rows;
      if (countPortrait > countLandscape) {
        bestOrientation = 'portrait';
        finalCols = fitPortrait.cols;
        finalRows = fitPortrait.rows;
        finalRotated = fitPortrait.isRotated;
      } else {
        bestOrientation = 'landscape';
        finalCols = fitLandscape.cols;
        finalRows = fitLandscape.rows;
        finalRotated = fitLandscape.isRotated;
      }
    }

    const sheetW = bestOrientation === 'landscape' ? sra3W : sra3H;
    const sheetH = bestOrientation === 'landscape' ? sra3H : sra3W;

    const activeW = finalRotated ? trimH : trimW;
    const activeH = finalRotated ? trimW : trimH;

    const totalGridW = finalCols * activeW + (finalCols - 1) * pdfGutterMm;
    const totalGridH = finalRows * activeH + (finalRows - 1) * pdfGutterMm;

    const startX = (sheetW - totalGridW) / 2;
    const startY = (sheetH - totalGridH) / 2;

    const startX_percent = (startX / sheetW) * 100;
    const startY_percent = (startY / sheetH) * 100;

    const chosenLabel = bestOrientation === 'landscape' ? "Liggend SRA3 (450x320 mm)" : "Staand SRA3 (320x450 mm)";
    const finalYield = finalCols * finalRows;

    return {
      sheetMargin,
      sheetW,
      sheetH,
      finalCols,
      finalRows,
      finalRotated,
      pdfGutterMm,
      activeW,
      activeH,
      startX_percent,
      startY_percent,
      chosenLabel,
      finalYield
    };
  }, [previewFile, pdfGutterMm, pdfSra3Orientation]);

  // Destructured SRA3 Layout values for the preview modal
  const {
    sheetMargin = 3,
    sheetW = 450,
    sheetH = 320,
    finalCols = 1,
    finalRows = 1,
    finalRotated = false,
    activeW = 210,
    activeH = 297,
    startX_percent = 0,
    startY_percent = 0,
    chosenLabel = "",
    finalYield = 0
  } = sra3Layout || {};

  // Customer Checkout Form
  const [clientActiveStep, setClientActiveStep] = useState<number>(1);
  const [stepGuidanceMessage, setStepGuidanceMessage] = useState<string>(
    "Stap 1: Kies het gewenste producttype dat u wilt laten controleren."
  );

  // Staff/Personnel states
  const [staffList, setStaffList] = useState<any[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState<boolean>(false);
  const [staffNameInput, setStaffNameInput] = useState<string>("");
  const [staffRoleInput, setStaffRoleInput] = useState<string>("");
  const [staffError, setStaffError] = useState<string | null>(null);

  // Admin Manual Order Creation states
  const [adminOrderClientName, setAdminOrderClientName] = useState<string>("");
  const [adminOrderClientEmail, setAdminOrderClientEmail] = useState<string>("");
  const [adminOrderClientPhone, setAdminOrderClientPhone] = useState<string>("");
  const [adminOrderClientReference, setAdminOrderClientReference] = useState<string>("");
  const [adminOrderSelectedProduct, setAdminOrderSelectedProduct] = useState<PrintProduct>(STANDARD_PRODUCTS[0]);
  const [adminOrderCustomWidth, setAdminOrderCustomWidth] = useState<number>(210);
  const [adminOrderCustomHeight, setAdminOrderCustomHeight] = useState<number>(297);
  const [adminOrderPrintSides, setAdminOrderPrintSides] = useState<'single' | 'double'>('single');
  const [adminOrderStickerShape, setAdminOrderStickerShape] = useState<StickerShape>('rectangle');
  const [adminOrderClientQuantity, setAdminOrderClientQuantity] = useState<number>(100);
  const [adminOrderComments, setAdminOrderComments] = useState<string>("");
  const [adminOrderAssignedStaff, setAdminOrderAssignedStaff] = useState<string>("");
  const [manualCreatedOrder, setManualCreatedOrder] = useState<any | null>(null);
  const [isCreatingManualOrder, setIsCreatingManualOrder] = useState<boolean>(false);

  const [isClientFormOpen, setIsClientFormOpen] = useState<boolean>(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  
  // Form fields
  const [clientName, setClientName] = useState<string>('');
  const [clientEmail, setClientEmail] = useState<string>('');
  const [clientPhone, setClientPhone] = useState<string>('');
  const [clientReference, setClientReference] = useState<string>('');
  const [clientComments, setClientComments] = useState<string>('');
  const [clientQuantity, setClientQuantity] = useState<number>(100);

  // Sync custom inputs on selecting standard size
  const handleSelectProduct = (product: PrintProduct) => {
    setSelectedProduct(product);
    setCustomWidth(product.widthMm);
    setCustomHeight(product.heightMm);
    
    // Stickers cannot be double-sided
    if (product.category === 'Sticker') {
      setPrintSides('single');
    }
    
    // Clear rotation and bypass alerts
    setFrontRotationDegrees(0);
    setBackRotationDegrees(0);
    setProceedAnywayAlert(false);
  };

  const handleChangePrintSides = (sides: 'single' | 'double') => {
    if (selectedProduct.category === 'Sticker' && sides === 'double') {
      return; // Force single-sided for stickers
    }
    setPrintSides(sides);
  };

  const handleClearFile = (side: 'front' | 'back' | 'both' = 'both') => {
    if (side === 'both') {
      setActiveFile(null);
      setBackActiveFile(null);
      setFilePixelWidth(0);
      setFilePixelHeight(0);
      setBackFilePixelWidth(0);
      setBackFilePixelHeight(0);
      setImageSrcUrl(null);
      setBackImageSrcUrl(null);
      setPdfPages([]);
      setSelectedFrontPageIdx(0);
      setSelectedBackPageIdx(1);
      setFrontRotationDegrees(0);
      setBackRotationDegrees(0);
    } else if (side === 'front') {
      setActiveFile(null);
      setFilePixelWidth(0);
      setFilePixelHeight(0);
      setImageSrcUrl(null);
      setFrontRotationDegrees(0);
    } else if (side === 'back') {
      setBackActiveFile(null);
      setBackFilePixelWidth(0);
      setBackFilePixelHeight(0);
      setBackImageSrcUrl(null);
      setBackRotationDegrees(0);
    }
    setProceedAnywayAlert(false);
  };

  const handleFileLoaded = (
    file: File,
    pixelWidth: number,
    pixelHeight: number,
    sourceUrl: string | null,
    backSourceUrl?: string | null,
    side: 'front' | 'back' | 'both' = 'both',
    detectedPdfPages?: { dataUrl: string; width: number; height: number }[]
  ) => {
    if (detectedPdfPages && detectedPdfPages.length > 0 && side === 'both') {
      // It's a processed PDF containing multiple pages for both sides
      const pagesWithMeta = detectedPdfPages.map(p => ({ ...p, filename: file.name }));
      setPdfPages(pagesWithMeta);
      
      const frontPage = pagesWithMeta[0];
      const backPage = pagesWithMeta.length > 1 ? pagesWithMeta[1] : pagesWithMeta[0];
      
      setActiveFile(file);
      setFilePixelWidth(frontPage.width);
      setFilePixelHeight(frontPage.height);
      setImageSrcUrl(frontPage.dataUrl);
      setSelectedFrontPageIdx(0);

      setBackActiveFile(file);
      setBackFilePixelWidth(backPage.width);
      setBackFilePixelHeight(backPage.height);
      setBackImageSrcUrl(backPage.dataUrl);
      setSelectedBackPageIdx(pagesWithMeta.length > 1 ? 1 : 0);
    } else if (detectedPdfPages && detectedPdfPages.length > 0 && (side === 'front' || side === 'back')) {
      // PDF loaded into a single specific slot
      const pagesWithMeta = detectedPdfPages.map(p => ({ ...p, filename: file.name }));
      setPdfPages(pagesWithMeta);
      const selectedPage = pagesWithMeta[0];
      
      if (side === 'front') {
        setActiveFile(file);
        setFilePixelWidth(selectedPage.width);
        setFilePixelHeight(selectedPage.height);
        setImageSrcUrl(selectedPage.dataUrl);
        setSelectedFrontPageIdx(0);
      } else {
        setBackActiveFile(file);
        setBackFilePixelWidth(selectedPage.width);
        setBackFilePixelHeight(selectedPage.height);
        setBackImageSrcUrl(selectedPage.dataUrl);
        setSelectedBackPageIdx(0);
      }
    } else {
      // Normal single image file loading
      if (side === 'both' || side === 'front') {
        setActiveFile(file);
        setFilePixelWidth(pixelWidth);
        setFilePixelHeight(pixelHeight);
        setImageSrcUrl(sourceUrl);
        
        // If they chose standard dual-sided and uploaded one image, they might upload the back separately.
        if (side === 'both' && backSourceUrl) {
          setBackActiveFile(file);
          setBackFilePixelWidth(pixelWidth);
          setBackFilePixelHeight(pixelHeight);
          setBackImageSrcUrl(backSourceUrl);
        }
      } else if (side === 'back') {
        setBackActiveFile(file);
        setBackFilePixelWidth(pixelWidth);
        setBackFilePixelHeight(pixelHeight);
        setBackImageSrcUrl(sourceUrl);
      }
    }

    if (side === 'both' || side === 'front') {
      setFrontRotationDegrees(0);
    }
    if (side === 'both' || side === 'back') {
      setBackRotationDegrees(0);
    }
    setProceedAnywayAlert(false);

    // Dynamic auto-detect landscape vs portrait and swap target dimensions if orientation mismatches
    const isImageLandscape = pixelWidth > pixelHeight;
    const isTargetLandscape = customWidth > customHeight;
    if (isImageLandscape !== isTargetLandscape) {
      setCustomWidth(customHeight);
      setCustomHeight(customWidth);
    }

    // Detect loaded files to decide if we should auto-advance to Step 4
    const hasFront = (side === 'both' || side === 'front') || !!activeFile;
    const hasBack = (side === 'both' && !!backSourceUrl) || (side === 'back') || !!backActiveFile || (detectedPdfPages && detectedPdfPages.length > 1);

    const shouldAutoAdvance = printSides === 'single' || (printSides === 'double' && hasFront && hasBack);

    if (shouldAutoAdvance) {
      // Auto-advance client to Step 4 for Preflight calculations review
      advanceToStep(4, `Stap 3 Voltooid! Uw bestand "${file.name}" is geladen. De preflight pre-press inspectie is live berekend in Stap 4.`);
    } else {
      // Prompt user to upload the second side on Step 3 before proceeding
      if (side === 'front') {
        setStepGuidanceMessage(`Voorzijde "${file.name}" geladen! Upload nu de achterzijde om uw dubbelzijdige drukwerk compleet te maken, of ga handmatig door naar Stap 4.`);
      } else if (side === 'back') {
        setStepGuidanceMessage(`Achterzijde "${file.name}" geladen! Upload nu de voorzijde om uw dubbelzijdige drukwerk compleet te maken, of ga handmatig door naar Stap 4.`);
      }
    }
  };

  const handleDropPdfPage = (idx: number, side: 'front' | 'back') => {
    if (pdfPages[idx]) {
      if (side === 'front') {
        setSelectedFrontPageIdx(idx);
        setFilePixelWidth(pdfPages[idx].width);
        setFilePixelHeight(pdfPages[idx].height);
        setImageSrcUrl(pdfPages[idx].dataUrl);
      } else {
        setSelectedBackPageIdx(idx);
        setBackFilePixelWidth(pdfPages[idx].width);
        setBackFilePixelHeight(pdfPages[idx].height);
        setBackImageSrcUrl(pdfPages[idx].dataUrl);
      }
    }
  };

  const handleDropLocalFile = async (file: File, side: 'front' | 'back') => {
    const fileSizeMb = file.size / (1024 * 1024);
    if (fileSizeMb > 50) return;

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        const result = await renderPdfFile(file, 8);
        if (result.pages.length > 0) {
          handleFileLoaded(file, result.pages[0].width, result.pages[0].height, result.pages[0].dataUrl, null, side, result.pages);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          handleFileLoaded(file, img.naturalWidth, img.naturalHeight, e.target?.result as string, null, side);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRotate90 = () => {
    if (activeFocusedSide === 'front') {
      setFrontRotationDegrees((prev) => (prev + 90) % 360);
    } else {
      setBackRotationDegrees((prev) => (prev + 90) % 360);
    }
  };

  const handleSwapSides = () => {
    // Save front to temp vars
    const tempFile = activeFile;
    const tempWidth = filePixelWidth;
    const tempHeight = filePixelHeight;
    const tempUrl = imageSrcUrl;
    const tempFit = frontFitMode;
    const tempRot = frontRotationDegrees;
    const tempIdx = selectedFrontPageIdx;

    // Swap front with back
    setActiveFile(backActiveFile);
    setFilePixelWidth(backFilePixelWidth);
    setFilePixelHeight(backFilePixelHeight);
    setImageSrcUrl(backImageSrcUrl);
    setFrontFitMode(backFitMode);
    setFrontRotationDegrees(backRotationDegrees);
    setSelectedFrontPageIdx(selectedBackPageIdx);

    // Swap back with temp front
    setBackActiveFile(tempFile);
    setBackFilePixelWidth(tempWidth);
    setBackFilePixelHeight(tempHeight);
    setBackImageSrcUrl(tempUrl);
    setBackFitMode(tempFit);
    setBackRotationDegrees(tempRot);
    setSelectedBackPageIdx(tempIdx);

    // Swap focused side if appropriate
    setActiveFocusedSide((prev) => (prev === 'front' ? 'back' : 'front'));
  };

  const fetchAdminOrders = async () => {
    setIsLoadingOrders(true);
    setAdminAuthError(null);
    try {
      const response = await fetch('/api/orders', {
        headers: {
          'Authorization': 'FD2026'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      } else {
        const errorData = await response.json();
        setAdminAuthError(errorData.error || 'Kon de orders niet inladen.');
      }
    } catch (err) {
      console.warn('Kan API niet bereiken, laden van fallback:', err);
      try {
        const cached = localStorage.getItem('fd_orders_fallback');
        if (cached) {
          setOrders(JSON.parse(cached));
        } else {
          setOrders([]);
        }
      } catch (inner) {
        setOrders([]);
      }
    } finally {
      setIsLoadingOrders(false);
    }
  };

  // Helper to guide clients through the stepper wizard smoothly with smooth auto-scroll
  function advanceToStep(stepNumber: number, message: string) {
    setClientActiveStep(stepNumber);
    setStepGuidanceMessage(message);
    setTimeout(() => {
      const elemId = stepNumber === 1 ? 'step-1-section' : stepNumber === 2 ? 'step-2-section' : stepNumber === 3 ? 'step-3-section' : 'step-4-section';
      const element = document.getElementById(elemId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 400);
  }

  const fetchAdminStaff = async () => {
    setIsLoadingStaff(true);
    setStaffError(null);
    try {
      const response = await fetch('/api/staff', {
        headers: {
          'Authorization': 'FD2026'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setStaffList(data);
      }
    } catch (err) {
      console.error('Error fetching staff list:', err);
    } finally {
      setIsLoadingStaff(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffNameInput || !staffRoleInput) {
      setStaffError("Voer zowel de naam als de rol in.");
      return;
    }
    setStaffError(null);
    try {
      const response = await fetch('/api/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'FD2026'
        },
        body: JSON.stringify({ name: staffNameInput, role: staffRoleInput })
      });
      if (response.ok) {
        setStaffNameInput("");
        setStaffRoleInput("");
        fetchAdminStaff();
      } else {
        const err = await response.json();
        setStaffError(err.error || "Er is een fout opgetreden.");
      }
    } catch (e) {
      setStaffError("Kan de server niet bereiken.");
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!window.confirm("Weet u zeker dat u dit personnellid wilt verwijderen?")) return;
    try {
      const response = await fetch(`/api/staff/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'FD2026'
        }
      });
      if (response.ok) {
        fetchAdminStaff();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignStaff = async (orderId: string, staffName: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'FD2026'
        },
        body: JSON.stringify({ assignedStaff: staffName })
      });
      if (response.ok) {
        fetchAdminOrders();
      }
    } catch (e) {
      console.error("Staff assignment failed:", e);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Weet u zeker dat u deze bestelling wilt verwijderen uit de backoffice?')) return;
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'FD2026'
        }
      });
      if (response.ok) {
        fetchAdminOrders();
      } else {
        alert('Kon bestelling niet verwijderen op de server.');
      }
    } catch (err) {
      const filtered = orders.filter((o) => o.id !== orderId);
      setOrders(filtered);
      localStorage.setItem('fd_orders_fallback', JSON.stringify(filtered));
    }
  };

  const handleAdminLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (adminPasswordInput === 'FD2026') {
      setIsAdminAuthenticated(true);
      setAdminAuthError(null);
      try {
        sessionStorage.setItem('fd_admin_authed', 'true');
      } catch (e) {}
      fetchAdminOrders();
      fetchAdminStaff();
    } else {
      setAdminAuthError('Onjuist wachtwoord. Gebruik het wachtwoord "FD2026".');
    }
  };

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientEmail.trim() || !clientPhone.trim()) {
      setSubmissionError('Vul alstublieft alle verplichte velden in.');
      return;
    }

    setIsSubmittingOrder(true);
    setSubmissionError(null);

    const orderData = {
      clientName,
      clientEmail,
      clientPhone,
      clientReference,
      clientComments,
      clientQuantity,
      selectedProductId: selectedProduct.id,
      selectedProductName: selectedProduct.name,
      selectedProductCategory: selectedProduct.category,
      customWidth,
      customHeight,
      printSides,
      imageSrcUrl,
      backImageSrcUrl,
      frontRotationDegrees,
      backRotationDegrees,
      frontFitMode,
      backFitMode,
      frontFileName: activeFile?.name || 'Voorzijde.png',
      backFileName: backActiveFile?.name || (printSides === 'double' ? 'Achterzijde.png' : undefined),
      frontPixelWidth: filePixelWidth,
      frontPixelHeight: filePixelHeight,
      backPixelWidth: backActiveFile ? backFilePixelWidth : undefined,
      backPixelHeight: backActiveFile ? backFilePixelHeight : undefined,
      frontComputedDpi: analysisResult?.computedDpi || 300,
      backComputedDpi: analysisResult?.backComputedDpi || undefined,
    };

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderData })
      });

      if (response.ok) {
        const result = await response.json();
        setSubmittedOrderId(result.orderId);
        setIsClientFormOpen(false);
        setShowOrderSuccessModal(true);
        
        try {
          const cached = localStorage.getItem('fd_orders_fallback');
          const currentList = cached ? JSON.parse(cached) : [];
          currentList.unshift({ id: result.orderId, createdAt: new Date().toISOString(), ...orderData });
          localStorage.setItem('fd_orders_fallback', JSON.stringify(currentList));
        } catch (err) {}
      } else {
        const errResult = await response.json();
        setSubmissionError(errResult.error || 'Kon de bestelling niet indienen.');
      }
    } catch (err) {
      console.warn('POST failed, fallback to local indexing:', err);
      const mockId = "FD-" + Math.floor(100000 + Math.random() * 900000);
      const offlineOrder = { id: mockId, createdAt: new Date().toISOString(), ...orderData };
      
      try {
        const cached = localStorage.getItem('fd_orders_fallback');
        const currentList = cached ? JSON.parse(cached) : [];
        currentList.unshift(offlineOrder);
        localStorage.setItem('fd_orders_fallback', JSON.stringify(currentList));
        
        setSubmittedOrderId(mockId);
        setIsClientFormOpen(false);
        setShowOrderSuccessModal(true);
      } catch (cacheErr) {
        setSubmissionError('Lokaal opslaan is mislukt. Controleer uw browserinstellingen of verbinding.');
      }
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const parsedFilesList = useMemo(() => {
    const list: any[] = [];
    orders.forEach((order) => {
      if (order.imageSrcUrl) {
        list.push({
          key: `${order.id}-front`,
          id: order.id,
          fileName: order.frontFileName || 'A-Zijde.png',
          side: 'Voorkant (A-Zijde)',
          imageSrcUrl: order.imageSrcUrl,
          dpi: order.frontComputedDpi || 300,
          rotation: order.frontRotationDegrees || 0,
          fitMode: order.frontFitMode || 'fill',
          order: order,
        });
      }
      if (order.printSides === 'double' && order.backImageSrcUrl) {
        list.push({
          key: `${order.id}-back`,
          id: order.id,
          fileName: order.backFileName || 'B-Zijde.png',
          side: 'Achterkant (B-Zijde)',
          imageSrcUrl: order.backImageSrcUrl,
          dpi: order.backComputedDpi || 300,
          rotation: order.backRotationDegrees || 0,
          fitMode: order.backFitMode || 'fill',
          order: order,
        });
      }
    });
    return list;
  }, [orders]);

  const filteredFiles = useMemo(() => {
    return parsedFilesList.filter((f) => {
      // Category filter check
      if (adminCategoryFilter !== 'All') {
        if (f.order.selectedProductCategory !== adminCategoryFilter) {
          return false;
        }
      }
      
      // Search query check
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = f.fileName.toLowerCase().includes(query);
        const matchesClient = f.order.clientName?.toLowerCase().includes(query) || f.order.clientEmail?.toLowerCase().includes(query);
        const matchesOrderId = f.id.toLowerCase().includes(query);
        return matchesName || matchesClient || matchesOrderId;
      }
      
      return true;
    });
  }, [parsedFilesList, adminCategoryFilter, searchQuery]);

  const handleToggleSelectFile = (key: string) => {
    setSelectedFileKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // ==========================================
  // HIGH-RESOLUTION PDF & SRA3 IMPOSITION ENGINE
  // ==========================================

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = src;
    });
  };

  const drawImageToHighResCanvas = (
    img: HTMLImageElement,
    rot: number,
    fit: string,
    wMm: number,
    hMm: number,
    bleedMm: number,
    includeBleed: boolean
  ): HTMLCanvasElement => {
    const canvas = document.createElement('canvas');
    const dpmm = 11.811; // 300 DPI (approx 11.811 pixels per millimeter)

    // The destination container size (including bleed if requested)
    const targetWMm = includeBleed ? (wMm + 2 * bleedMm) : wMm;
    const targetHMm = includeBleed ? (hMm + 2 * bleedMm) : hMm;

    const canvasWidth = Math.round(targetWMm * dpmm);
    const canvasHeight = Math.round(targetHMm * dpmm);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Clear/White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;

      // Rotation angle in radians
      const rotRad = ((rot % 360) * Math.PI) / 180;
      const is90Rotated = ((rot % 180) !== 0);

      // The rotated image has swapped dimensions for fitting calculation
      const rotW = is90Rotated ? imgH : imgW;
      const rotH = is90Rotated ? imgW : imgH;

      let drawW = canvasWidth;
      let drawH = canvasHeight;

      if (fit === 'fill') {
        const ratioTarget = canvasWidth / canvasHeight;
        const ratioImage = rotW / rotH;
        if (ratioImage > ratioTarget) {
          // Image is wider than canvas, match height
          drawH = canvasHeight;
          drawW = canvasHeight * ratioImage;
        } else {
          // Image is taller than canvas, match width
          drawW = canvasWidth;
          drawH = canvasWidth / ratioImage;
        }
      } else if (fit === 'fit') {
        const ratioTarget = canvasWidth / canvasHeight;
        const ratioImage = rotW / rotH;
        if (ratioImage > ratioTarget) {
          // Image is wider than canvas, match width
          drawW = canvasWidth;
          drawH = canvasWidth / ratioImage;
        } else {
          // Image is taller than canvas, match height
          drawH = canvasHeight;
          drawW = canvasHeight * ratioImage;
        }
      }

      // Now draw with translation & rotation centered on the canvas
      ctx.save();
      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      ctx.rotate(rotRad);

      // Note: If rotated, the drawW and drawH correspond to the rotated visual dimensions.
      // Since context is rotated, we draw the original img source at its original aspect ratio!
      const drawWidthInContext = is90Rotated ? drawH : drawW;
      const drawHeightInContext = is90Rotated ? drawW : drawH;

      ctx.drawImage(
        img,
        -drawWidthInContext / 2,
        -drawHeightInContext / 2,
        drawWidthInContext,
        drawHeightInContext
      );
      ctx.restore();
    }

    return canvas;
  };

  const drawRegisterTarget = (doc: any, cx: number, cy: number) => {
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.1);
    doc.circle(cx, cy, 2, 'S');
    doc.circle(cx, cy, 0.8, 'S');
    doc.line(cx - 3.5, cy, cx + 3.5, cy);
    doc.line(cx, cy - 3.5, cx, cy + 3.5);
  };

  const drawCropMarks = (doc: any, startX: number, startY: number, trimW: number, trimH: number, bleedMm: number, fileItem: any) => {
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.15);

    // Corner 1: Top-Left
    doc.line(startX - 10, startY, startX - 2, startY);
    doc.line(startX, startY - 10, startX, startY - 2);

    // Corner 2: Top-Right
    doc.line(startX + trimW + 2, startY, startX + trimW + 10, startY);
    doc.line(startX + trimW, startY - 10, startX + trimW, startY - 2);

    // Corner 3: Bottom-Left
    doc.line(startX - 10, startY + trimH, startX - 2, startY + trimH);
    doc.line(startX, startY + trimH + 2, startX, startY + trimH + 10);

    // Corner 4: Bottom-Right
    doc.line(startX + trimW + 2, startY + trimH, startX + trimW + 10, startY + trimH);
    doc.line(startX + trimW, startY + trimH + 2, startX + trimW, startY + trimH + 10);

    // Draw Register Targets around trimming margins
    drawRegisterTarget(doc, startX + trimW / 2, startY - 6);
    drawRegisterTarget(doc, startX + trimW / 2, startY + trimH + 6);
    drawRegisterTarget(doc, startX - 6, startY + trimH / 2);
    drawRegisterTarget(doc, startX + trimW + 6, startY + trimH / 2);

    // Production job metadata watermark in margin
    const sideLabel = fileItem.side.includes('Voorkant') ? 'VOORKANT (A-ZIJDE)' : 'ACHTERKANT (B-ZIJDE)';
    const jobText = `ORDER: ${fileItem.order.id} | EXPORT: INDIVIDUEEL DRUKBESTAND | OPTIE: +${bleedMm}mm AFLOOP (BLEED) | PRODUCT: ${fileItem.order.selectedProductCategory?.toUpperCase()} (${trimW}x${trimH} mm) | FILTER-ZIJDE: ${sideLabel} | DATUM: ${new Date().toLocaleDateString('nl-NL')}`;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(110, 110, 110);
    doc.text(jobText, startX, startY - 3.5);
  };

  const drawCropMarksForCell = (doc: any, posX: number, posY: number, w: number, h: number, bleed: number) => {
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.1);

    // Tiny 3.5mm crop marks placed 1mm outside boundaries
    const offset = 1;
    const len = 3.5;

    // TL
    doc.line(posX - offset - len, posY, posX - offset, posY);
    doc.line(posX, posY - offset - len, posX, posY - offset);

    // TR
    doc.line(posX + w + offset, posY, posX + w + offset + len, posY);
    doc.line(posX + w, posY - offset - len, posX + w, posY - offset);

    // BL
    doc.line(posX - offset - len, posY + h, posX - offset, posY + h);
    doc.line(posX, posY + h + offset, posX, posY + h + offset + len);

    // BR
    doc.line(posX + w + offset, posY + h, posX + w + offset + len, posY + h);
    doc.line(posX + w, posY + h + offset, posX + w, posY + h + offset + len);
  };

  const drawSra3InformationHeader = (
    doc: any,
    sW: number,
    sH: number,
    iW: number,
    iH: number,
    cols: number,
    rows: number,
    fileItem: any,
    gW: number,
    gH: number
  ) => {
    // Print register targets on all four outer SRA3 sheet margin edges
    drawRegisterTarget(doc, 7, sH / 2);
    drawRegisterTarget(doc, sW - 7, sH / 2);
    drawRegisterTarget(doc, sW / 2, 7);
    drawRegisterTarget(doc, sW / 2, sH - 7);

    // Color control bars (cyan, magenta, yellow, black targets) at bottom edge
    const cbColors = [
      { r: 0, g: 174, b: 239 }, // Cyan
      { r: 236, g: 0, b: 140 }, // Magenta
      { r: 255, g: 242, b: 0 }, // Yellow
      { r: 35, g: 31, b: 32 }    // Black
    ];
    cbColors.forEach((color, idx) => {
      doc.setFillColor(color.r, color.g, color.b);
      doc.rect(sW / 2 - 20 + idx * 10, sH - 8, 8, 3, 'F');
    });

    // Write primary SRA3 printing workspace header metadata text
    const sideLabel = fileItem.side.includes('Voorkant') ? 'A-ZIJDE (VOORKANT)' : 'B-ZIJDE (ACHTERKANT)';
    const headerText = `[SRA3 PRE-PRESS EXPORT] | ORDER ID: ${fileItem.order.id} | OPTELLING: ${cols * rows} OP VEL (${cols}x${rows} GRID) | KLANT: ${fileItem.order.clientName?.toUpperCase()} | METADATA BRON: ${fileItem.fileName} | GEPLAND FORMAAT: ${iW}x${iH} mm | ZIJDESPEC: ${sideLabel} | GENEREER-DATUM: ${new Date().toLocaleDateString('nl-NL')}`;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(80, 80, 80);
    doc.text(headerText, (sW - gW) / 2, ((sH - gH) / 2) - 8);
  };

  const handleGeneratePdfAndDownload = async (fileItem: any) => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);

    try {
      const trimW = Number(fileItem.order.customWidth) || 210;
      const trimH = Number(fileItem.order.customHeight) || 297;

      // Resolve the base64/url source image layout
      const img = await loadImage(fileItem.imageSrcUrl);
      const rot = fileItem.rotation || 0;
      const fit = fileItem.fitMode || 'fill';

      if (pdfLayoutMode === 'single') {
        const marginMm = pdfWithCropMarks ? 12 : 0;
        const pageWidth = trimW + 2 * marginMm;
        const pageHeight = trimH + 2 * marginMm;

        const doc = new jsPDF({
          orientation: pageWidth > pageHeight ? 'landscape' : 'portrait',
          unit: 'mm',
          format: [pageWidth, pageHeight]
        });

        // Background
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        // Render target coordinates
        const targetX = marginMm - (pdfWithCropMarks ? pdfBleedMm : 0);
        const targetY = marginMm - (pdfWithCropMarks ? pdfBleedMm : 0);
        const targetW = trimW + (pdfWithCropMarks ? 2 * pdfBleedMm : 0);
        const targetH = trimH + (pdfWithCropMarks ? 2 * pdfBleedMm : 0);

        // Render our lossless scaled canvas representation
        const highResCanvas = drawImageToHighResCanvas(img, rot, fit, trimW, trimH, pdfBleedMm, pdfWithCropMarks);
        const imgData = highResCanvas.toDataURL('image/png', 1.0);

        doc.addImage(imgData, 'PNG', targetX, targetY, targetW, targetH, undefined, 'FAST');

        if (pdfWithCropMarks) {
          drawCropMarks(doc, marginMm, marginMm, trimW, trimH, pdfBleedMm, fileItem);
        }

        const clientSanitized = fileItem.order.clientName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'klant';
        const sideLetter = fileItem.side.includes('Voorkant') ? 'A' : 'B';
        doc.save(`${fileItem.order.id}_${clientSanitized}_DRUKBESTAND_${sideLetter}_ZIJDE.pdf`);
      } else {
        // SRA3 Sheets (450 mm x 320 mm)
        const sra3W = 450;
        const sra3H = 320;

        const sheetMargin = 3;
        const usableW = sra3W - 2 * sheetMargin;
        const usableH = sra3H - 2 * sheetMargin;

        const fitLandscape = calculateGridConfig(usableW, usableH, trimW, trimH, pdfGutterMm);
        const fitPortrait = calculateGridConfig(usableH, usableW, trimW, trimH, pdfGutterMm);

        let bestOrientation: 'landscape' | 'portrait' = 'landscape';
        let finalCols = fitLandscape.cols;
        let finalRows = fitLandscape.rows;
        let finalRotated = fitLandscape.isRotated;

        if (pdfSra3Orientation === 'landscape') {
          bestOrientation = 'landscape';
          finalCols = fitLandscape.cols;
          finalRows = fitLandscape.rows;
          finalRotated = fitLandscape.isRotated;
        } else if (pdfSra3Orientation === 'portrait') {
          bestOrientation = 'portrait';
          finalCols = fitPortrait.cols;
          finalRows = fitPortrait.rows;
          finalRotated = fitPortrait.isRotated;
        } else {
          const countLandscape = fitLandscape.cols * fitLandscape.rows;
          const countPortrait = fitPortrait.cols * fitPortrait.rows;
          if (countPortrait > countLandscape) {
            bestOrientation = 'portrait';
            finalCols = fitPortrait.cols;
            finalRows = fitPortrait.rows;
            finalRotated = fitPortrait.isRotated;
          } else {
            bestOrientation = 'landscape';
            finalCols = fitLandscape.cols;
            finalRows = fitLandscape.rows;
            finalRotated = fitLandscape.isRotated;
          }
        }

        const sheetW = bestOrientation === 'landscape' ? sra3W : sra3H;
        const sheetH = bestOrientation === 'landscape' ? sra3H : sra3W;

        const doc = new jsPDF({
          orientation: bestOrientation,
          unit: 'mm',
          format: [sheetW, sheetH]
        });

        // Background page canvas
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, sheetW, sheetH, 'F');

        const activeW = finalRotated ? trimH : trimW;
        const activeH = finalRotated ? trimW : trimH;

        const totalGridW = finalCols * activeW + (finalCols - 1) * pdfGutterMm;
        const totalGridH = finalRows * activeH + (finalRows - 1) * pdfGutterMm;

        const startX = (sheetW - totalGridW) / 2;
        const startY = (sheetH - totalGridH) / 2;

        const highResCanvasNormal = drawImageToHighResCanvas(img, rot, fit, trimW, trimH, pdfBleedMm, true);
        const pngNormal = highResCanvasNormal.toDataURL('image/png', 1.0);

        const highResCanvasRotated = drawImageToHighResCanvas(img, rot + 90, fit, trimH, trimW, pdfBleedMm, true);
        const pngRotated = highResCanvasRotated.toDataURL('image/png', 1.0);

        const activePngData = finalRotated ? pngRotated : pngNormal;
        const drawItemW = activeW + 2 * pdfBleedMm;
        const drawItemH = activeH + 2 * pdfBleedMm;

        for (let r = 0; r < finalRows; r++) {
          for (let c = 0; c < finalCols; c++) {
            const posX = startX + c * (activeW + pdfGutterMm);
            const posY = startY + r * (activeH + pdfGutterMm);

            const drawX = posX - pdfBleedMm;
            const drawY = posY - pdfBleedMm;

            doc.addImage(activePngData, 'PNG', drawX, drawY, drawItemW, drawItemH, undefined, 'FAST');
            drawCropMarksForCell(doc, posX, posY, activeW, activeH, pdfBleedMm);
          }
        }

        drawSra3InformationHeader(doc, sheetW, sheetH, activeW, activeH, finalCols, finalRows, fileItem, totalGridW, totalGridH);

        const clientSanitized = fileItem.order.clientName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'klant';
        const sideLetter = fileItem.side.includes('Voorkant') ? 'A' : 'B';
        doc.save(`${fileItem.order.id}_${clientSanitized}_SRA3_IMPOSITIE_${sideLetter}_ZIJDE.pdf`);
      }
    } catch (err) {
      console.error('Failure rendering custom vector PDF crop markers:', err);
      alert('Er is een fout opgetreden bij het exporteren van uw PDF-bestand. Controleer de afbeeldingsgrootte of de logbestanden.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const downloadSingleFile = (fileItem: any) => {
    // Standard backoffice download is compiled as a high-fidelity exact-format pre-press PDF
    handleGeneratePdfAndDownload(fileItem);
  };

  const fetchTrackedOrder = async (orderId: string) => {
    setIsLoadingTrackedOrder(true);
    try {
      const response = await fetch(`/api/orders/${orderId}`);
      if (response.ok) {
        const data = await response.json();
        setTrackedOrder(data);
        
        // Match rotation and fit mode states from order data if set
        if (data.frontRotationDegrees !== undefined) setFrontRotationDegrees(data.frontRotationDegrees);
        if (data.backRotationDegrees !== undefined) setBackRotationDegrees(data.backRotationDegrees);
        if (data.frontFitMode !== undefined) setFrontFitMode(data.frontFitMode);
        if (data.backFitMode !== undefined) setBackFitMode(data.backFitMode);
      } else {
        setTrackedOrder(null);
      }
    } catch (err) {
      console.error("Fout bij het ophalen van de bestelling status:", err);
      setTrackedOrder(null);
    } finally {
      setIsLoadingTrackedOrder(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    if (orderId) {
      setTrackedOrderId(orderId);
      fetchTrackedOrder(orderId);
    }
  }, []);

  useEffect(() => {
    if (isAdminAuthenticated) {
      fetchAdminOrders();
      fetchAdminStaff();
    }
  }, [isAdminAuthenticated]);

  // Perform dynamic pre-press audit calculation based on chosen file and targets
  const analysisResult = useMemo((): FileAnalysis | null => {
    if (!activeFile) return null;

    // Accounts for rotation-based aspect ratios
    const isRotated90 = frontRotationDegrees === 90 || frontRotationDegrees === 270;
    const currentFileWidth = isRotated90 ? filePixelHeight : filePixelWidth;
    const currentFileHeight = isRotated90 ? filePixelWidth : filePixelHeight;

    const fileAspectRatio = currentFileWidth / currentFileHeight;
    const targetAspectRatio = customWidth / customHeight;

    // Tolerance allowance for printing cropping (5%)
    const ratioTolerance = 0.08;
    const ratioDifference = Math.abs(fileAspectRatio - targetAspectRatio);
    const aspectRatioOk = ratioDifference <= ratioTolerance;

    // DPI calculation: Target length in inches
    const widthInches = customWidth / 25.4;
    const computedDpi = Math.round(currentFileWidth / widthInches);
    const dpiOk = computedDpi >= 240; // 300 DPI is standard, warn below 240

    // Deduce file type state colorspace
    const colorSpace = activeFile.type?.includes('pdf') ? 'CMYK' : 'RGB';

    // Decide state outcome
    let stateResult: 'success' | 'warning' | 'error' = 'success';
    let errorMessage = '';
    let warningMessage = '';

    const isStickerTooSmall = selectedProduct.category === 'Sticker' && (customWidth < 30 || customHeight < 30);

    if (isStickerTooSmall) {
      stateResult = 'error';
      errorMessage = `Foutieve sticker afmetingen! Vinyl stickers moeten minimaal 30 mm × 30 mm (3 cm × 3 cm) zijn. Uw huidige afmetingen zijn ${customWidth} mm × ${customHeight} mm.`;
    } else if (!aspectRatioOk) {
      stateResult = 'error';
      errorMessage = `Incorrect Aspect Ratio (Voorkant)! De verhouding van uw product is ${targetAspectRatio.toFixed(2)}, maar uw voorkant bestand heeft een verhouding van ${fileAspectRatio.toFixed(2)}. Klik op roteren of pas de breedte/hoogte aan.`;
    } else if (!dpiOk && !proceedAnywayAlert) {
      stateResult = 'warning';
      warningMessage = `Lage resolutie waarschuwing (Voorkant)! Uw voorkant bestand heeft een effectieve resolutie van ${computedDpi} DPI. Wij adviseren minimaal 240/300 DPI voor hoge kwaliteit.`;
    }

    // Checking BACK file if double-sided
    let backDpiOk = true;
    let backRatioOk = true;
    let backDpi = 0;
    if (printSides === 'double' && backActiveFile && stateResult === 'success') {
      const isBackRotated90 = backRotationDegrees === 90 || backRotationDegrees === 270;
      const backCurrentWidth = isBackRotated90 ? backFilePixelHeight : backFilePixelWidth;
      const backCurrentHeight = isBackRotated90 ? backFilePixelWidth : backFilePixelHeight;
      const backAspectRatio = backCurrentWidth / backCurrentHeight;
      const backRatioDiff = Math.abs(backAspectRatio - targetAspectRatio);
      backRatioOk = backRatioDiff <= ratioTolerance;
      backDpi = Math.round(backCurrentWidth / widthInches);
      backDpiOk = backDpi >= 240;

      if (!backRatioOk) {
        stateResult = 'error';
        errorMessage = `Verkeerde beeldverhouding (Achterkant)! Uw product verhouding is ${targetAspectRatio.toFixed(2)}, maar uw achterkant bestand heeft een verhouding van ${backAspectRatio.toFixed(2)}.`;
      } else if (!backDpiOk && !proceedAnywayAlert) {
        stateResult = 'warning';
        warningMessage = `Lage resolutie waarschuwing! Uw achterkant bestand heeft een effectieve resolutie van ${backDpi} DPI.`;
      }
    }

    return {
      fileName: activeFile.name,
      fileSize: activeFile.size + (backActiveFile ? backActiveFile.size : 0),
      fileType: activeFile.type,
      pixelWidth: currentFileWidth,
      pixelHeight: currentFileHeight,
      computedDpi: printSides === 'double' && backActiveFile ? Math.min(computedDpi, backDpi) : computedDpi,
      aspectRatioOk: isStickerTooSmall ? false : (printSides === 'double' && backActiveFile ? (aspectRatioOk && backRatioOk) : aspectRatioOk),
      dpiOk: (dpiOk && (printSides === 'double' && backActiveFile ? backDpiOk : true)) || proceedAnywayAlert,
      colorSpace: colorSpace as 'RGB' | 'CMYK',
      hasBleed: true, // assumes modern camera cropping layouts
      feedbackState: stateResult,
      errorMessage,
      warningMessage,
      successMessage: `Perfect! Resolutie, vorm en aspect ratio voldoen aan alle pre-press eisen voor ${printSides === 'double' ? 'beide zijden' : 'uw afdruk'}.`,
      backFileName: backActiveFile?.name,
      backFileSize: backActiveFile?.size,
      backPixelWidth: backActiveFile ? (backRotationDegrees === 90 || backRotationDegrees === 270 ? backFilePixelHeight : backFilePixelWidth) : undefined,
      backPixelHeight: backActiveFile ? (backRotationDegrees === 90 || backRotationDegrees === 270 ? backFilePixelWidth : backFilePixelHeight) : undefined,
      backComputedDpi: backActiveFile ? backDpi : undefined,
      backDpiOk: backActiveFile ? backDpiOk : undefined,
    };
  }, [activeFile, backActiveFile, printSides, customWidth, customHeight, filePixelWidth, filePixelHeight, backFilePixelWidth, backFilePixelHeight, frontRotationDegrees, backRotationDegrees, proceedAnywayAlert, selectedProduct, stickerShape]);

  const renderTrackingPortal = () => {
    if (isLoadingTrackedOrder) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center space-y-4">
          <RefreshCw className="w-10 h-10 text-blue-600 animate-spin" />
          <p className="text-sm font-semibold text-slate-500 font-sans">
            Bestelling gegevens worden geladen uit het FD pre-press systeem...
          </p>
        </div>
      );
    }

    if (!trackedOrder) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto space-y-6">
          <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-bold text-slate-950 font-sans">Bestelling niet gevonden</h2>
            <p className="text-xs text-slate-400">
              Het order ID <span className="font-mono font-bold text-slate-700">{trackedOrderId}</span> is niet bekend in ons systeem, of is onlangs verwijderd door de pre-press medewerkers.
            </p>
          </div>
          <button
            onClick={() => {
              // Clear query params on browser
              window.history.pushState({}, '', '/');
              setTrackedOrderId(null);
            }}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl transition-all shadow-md cursor-pointer"
          >
            Nieuwe Preflight starten
          </button>
        </div>
      );
    }

    const o = trackedOrder;
    const isActionRequired = o.status?.toLowerCase().includes('actie') || o.status?.toLowerCase().includes('afgekeurd');

    // Stepper logic
    const steps = [
      { id: 1, label: 'Ingediend', desc: 'Preflight ingediend', activeStatuses: ['ingediend'] },
      { id: 2, label: 'Preflight', desc: 'Pre-press bestandcontrole', activeStatuses: ['bestanden controleren', 'in controle', 'bestanden gewijzigd'] },
      { id: 3, label: 'Goedgekeurd', desc: 'Drukpers-vrijgave verleend', activeStatuses: ['goedgekeurd', 'preflight goedgekeurd', 'klaar voor druk'] },
      { id: 4, label: 'In Productie', desc: 'SRA3 druk- & snijfase', activeStatuses: ['in druk', 'drukken', 'printen'] },
      { id: 5, label: 'Gereed', desc: 'Klaar voor afhalen / bezorgd', activeStatuses: ['klaar voor afhalen', 'klaar', 'verzonden', 'afgehaald'] }
    ];

    // Determine current index active
    let currentStepIdx = 1;
    const currentStatusLower = (o.status || 'ingediend').toLowerCase();
    
    // Find matching step if any
    const matchedStep = steps.find(s => s.activeStatuses.includes(currentStatusLower));
    if (matchedStep) {
      currentStepIdx = matchedStep.id;
    } else {
      // If none match and it's rejected, flag at prepress phase
      if (isActionRequired) {
        currentStepIdx = 2; // Stuck at preflight
      } else if (currentStatusLower.includes('verzond') || currentStatusLower.includes('klaar')) {
        currentStepIdx = 5;
      } else if (currentStatusLower.includes('druk')) {
        currentStepIdx = 4;
      } else if (currentStatusLower.includes('gewijzi')) {
        currentStepIdx = 2;
      }
    }

    // Colors mapping
    let badgeColorClass = "bg-blue-100 text-blue-800 border-blue-200";
    if (currentStatusLower.includes('controle') || currentStatusLower.includes('bestanden controleren')) {
      badgeColorClass = "bg-amber-100 text-amber-805 border-amber-200";
    } else if (currentStatusLower.includes('goedgekeurd') || currentStatusLower.includes('druk')) {
      badgeColorClass = "bg-indigo-50 text-indigo-700 border-indigo-150";
    } else if (currentStatusLower.includes('klaar') || currentStatusLower.includes('verzond')) {
      badgeColorClass = "bg-[#f0fdf4] text-emerald-800 border-emerald-150";
    } else if (isActionRequired) {
      badgeColorClass = "bg-rose-600 text-white border-rose-700 font-extrabold";
    } else if (currentStatusLower.includes('gewijzi')) {
      badgeColorClass = "bg-purple-100 text-purple-800 border-purple-200";
    }

    // QR scan link
    const trackingUrl = `${window.location.origin}/?orderId=${o.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(trackingUrl)}`;

    // Client-side file selection for correction
    const handleCustomerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const trimW = Number(o.customWidth) || 210;
          const trimH = Number(o.customHeight) || 297;
          // Calculate DPI:
          // DPI = (pixels / dimension_mm) * 25.4
          const dpi = Math.round((Math.max(img.naturalWidth, img.naturalHeight) / Math.max(trimW, trimH)) * 25.4);
          
          setCustomerUploadedDpi(dpi);
          setCustomerUploadedFileName(file.name);
          setCustomerUploadedPixels({ w: img.naturalWidth, h: img.naturalHeight });
          setCustomerUploadedImage(event.target?.result as string);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    };

    const handleUploadCorruptedFile = async () => {
      if (!customerUploadedImage) return;
      setIsUploadingCustomerFile(true);
      try {
        const res = await fetch(`/api/orders/${o.id}/update-file`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            side: customerUploadSide,
            imageSrcUrl: customerUploadedImage,
            fileName: customerUploadedFileName,
            dpi: customerUploadedDpi,
            pixelWidth: customerUploadedPixels.w,
            pixelHeight: customerUploadedPixels.h
          })
        });

        if (res.ok) {
          const data = await res.json();
          // Reload order
          setTrackedOrder(data.order);
          // Clear upload state
          setCustomerUploadedImage(null);
          setCustomerUploadedFileName('');
          alert('Uw gewijzigde bestand is succesvol verwerkt en ingestuurd naar de Pre-Press operator! De status is gewijzigd naar "Bestanden Gewijzigd".');
        } else {
          alert('Fout bij het bijwerken van het bestand.');
        }
      } catch (err) {
        console.error('Customer file update failure:', err);
        alert('Fout bij het verbinding maken met de preflight servers.');
      } finally {
        setIsUploadingCustomerFile(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
        {/* Banner with FD Printing identity */}
        <header className="bg-[#0b1a30] text-white py-6 border-b border-slate-800 shadow-md">
          <div className="max-w-6xl mx-auto px-4 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-900/40 rounded-xl flex items-center justify-center border border-blue-500/20">
                <svg width="22" height="22" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="77" fill="none" stroke="#3b82f6" strokeWidth="8" />
                  <path d="M 65 55 L 65 105 M 65 55 L 90 55 Q 100 55 100 68 Q 100 80 90 80 L 65 80" fill="none" stroke="#ffffff" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h1 className="font-extrabold text-base tracking-tight leading-none">FD Printing Center</h1>
                <p className="text-[10px] text-blue-300 font-semibold mt-0.5 uppercase tracking-wider">Live Bestelling Status Tracking</p>
              </div>
            </div>
            <button
              onClick={() => {
                window.history.pushState({}, '', '/');
                setTrackedOrderId(null);
                setTrackedOrder(null);
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all cursor-pointer border border-white/10 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Nieuwe Preflight Editor
            </button>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT: TIMELINE STEPPER & LOGS */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Main Status Showcase Panel */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-3xs space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-mono font-black text-slate-400">BESTELLING REFERENTIE</span>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-2xl font-black text-slate-900 font-mono tracking-tight">{o.id}</h2>
                    {o.clientReference && (
                      <span className="bg-slate-100 text-slate-650 px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-slate-205">Ref: {o.clientReference}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-mono font-black text-slate-400 block mb-1">HUIDIGE STATUS</span>
                  <span className={`px-4 py-1.5 rounded-full text-xs font-black border uppercase tracking-wider ${badgeColorClass}`}>
                    {isActionRequired ? "⚠️ " : ""}
                    {o.status || 'Ingediend'}
                  </span>
                </div>
              </div>

              {/* Graphical Visual Stepper */}
              <div className="border-t border-slate-100 pt-6 select-none relative">
                {/* Horizontal line backup */}
                <div className="absolute top-[20px] left-8 right-8 h-1 bg-slate-200 -z-0 hidden sm:block rounded"></div>
                {/* Colored fill line */}
                <div 
                  className="absolute top-[20px] left-8 h-1 bg-emerald-500 -z-0 hidden sm:block rounded transition-all duration-500"
                  style={{ width: `${Math.max(0, Math.min(100, ((currentStepIdx - 1) / 4) * 88))}%` }}
                ></div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 sm:gap-2 relative z-10">
                  {steps.map((st) => {
                    const isDone = st.id < currentStepIdx;
                    const isCurrent = st.id === currentStepIdx;
                    const isFuture = st.id > currentStepIdx;

                    let stepColor = "bg-slate-100 border-slate-300 text-slate-400";
                    if (isDone) {
                      stepColor = "bg-emerald-500 border-emerald-600 text-white";
                    } else if (isCurrent) {
                      if (isActionRequired) {
                        stepColor = "bg-rose-600 border-rose-700 text-white animate-pulse";
                      } else {
                        stepColor = "bg-blue-600 border-blue-700 text-white ring-4 ring-blue-100";
                      }
                    }

                    return (
                      <div key={st.id} className="flex sm:flex-col items-center sm:text-center gap-3 sm:gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border font-bold text-sm tracking-tight transition-all duration-300 ${stepColor}`}>
                          {isDone ? '✓' : st.id}
                        </div>
                        <div className="space-y-0.5 text-left sm:text-center">
                          <p className={`font-bold text-xs ${isCurrent ? 'text-slate-900 font-extrabold' : 'text-slate-550'}`}>{st.label}</p>
                          <p className="text-[9px] text-slate-400 leading-tight block hidden sm:block">{st.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stepper feedback message */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs text-slate-600 leading-relaxed flex items-start gap-2 max-w-full">
                <span className="text-base leading-none shrink-0">&#128227;</span>
                <div>
                  {isActionRequired ? (
                    <p className="text-rose-900 font-bold">
                      <strong>Actie vereist:</strong> De pre-press operator heeft een opmerking geplaatst. Gelieve hieronder uw preflight-bestanden bij te werken om de order te hervatten.
                    </p>
                  ) : currentStepIdx === 5 ? (
                    <p className="text-emerald-800 font-bold">
                      <strong>Drukwerk gereed!</strong> Uw order is succesvol gedrukt en op maat gesneden. U kunt deze afhalen in Amsterdam of uw verzendcode bekijken.
                    </p>
                  ) : (
                    <p>
                      <strong>Live pre-press controle:</strong> Ons team bereidt uw bestanden voor om gedrukt te worden op SRA3 sheets. Eventuele updates zijn direct hier zichtbaar.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Action required / Initial Upload files panel */}
            {(isActionRequired || !o.imageSrcUrl) && (
              <div className="bg-rose-50 border-2 border-rose-250 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6 text-left">
                <div className="flex items-center gap-2.5 text-slate-800">
                  <div className={`w-8 h-8 rounded-full ${!o.imageSrcUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'} flex items-center justify-center text-sm font-black`}>
                    {!o.imageSrcUrl ? '↑' : '⚠'}
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 border-none">
                    {!o.imageSrcUrl ? 'Ontwerp-bestand Aanleveren' : 'Gecorrigeerd Bestand Aanleveren'}
                  </h3>
                </div>

                <div className="space-y-3.5">
                  {o.imageSrcUrl && (
                    <div className="bg-white border border-rose-200/60 p-4 rounded-xl text-xs space-y-1 shadow-4xs">
                      <span className="text-[10px] uppercase font-bold text-rose-600 block">Opmerking operator:</span>
                      <p className="text-slate-800 font-bold italic">
                        "{o.history?.[o.history.length - 1]?.note || "Het bestand heeft onvoldoende DPI of verkeerde verhoudingen."}"
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {!o.imageSrcUrl 
                      ? 'Upload het drukbestand (PNG of JPG) voor deze bestelling. Onze preflight engine valideert direct de gewenste DPI en beeldverhoudingen live.'
                      : 'Upload hier uw gewijzigde bestand (PNG of JPG) voor deze pre-press opdracht. Ons systeem herberekent direct de DPI voor preflight-goedkeuring.'}
                  </p>

                  <div className="grid grid-cols-2 gap-2 bg-white/60 p-1 rounded-xl border border-rose-200 max-w-xs">
                    <button
                      type="button"
                      onClick={() => { setCustomerUploadSide('front'); setCustomerUploadedImage(null); }}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${customerUploadSide === 'front' ? 'bg-rose-600 text-white' : 'text-rose-800 hover:bg-rose-200/50'}`}
                    >
                      A-Zijde (Voorkant)
                    </button>
                    {o.printSides === 'double' && (
                      <button
                        type="button"
                        onClick={() => { setCustomerUploadSide('back'); setCustomerUploadedImage(null); }}
                        className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${customerUploadSide === 'back' ? 'bg-rose-600 text-white' : 'text-rose-800 hover:bg-rose-200/50'}`}
                      >
                        B-Zijde (Achterkant)
                      </button>
                    )}
                  </div>

                  {/* Drag drop slot replacement trigger */}
                  <div className="border-2 border-dashed border-rose-250 bg-white hover:bg-slate-50 transition-all rounded-3xl p-8 text-center cursor-pointer relative">
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/jpg"
                      onChange={handleCustomerFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <div className="space-y-1.5">
                      <span className="text-2xl block">&#128196;</span>
                      <p className="text-xs font-bold text-slate-800">
                        Klik hier of sleep uw nieuwe {customerUploadSide === 'front' ? 'Voorkant' : 'Achterkant'} bestand om te uploaden
                      </p>
                      <p className="text-[10px] text-slate-400 font-semibold font-mono">PNG of JPG &bull; Automatische DPI weergave</p>
                    </div>
                  </div>

                  {customerUploadedImage && (
                    <div className="bg-white p-4 rounded-2xl border border-rose-150 space-y-4 text-xs shadow-4xs">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-16 bg-white border border-slate-200 rounded-md overflow-hidden relative flex items-center justify-center shrink-0">
                          <img src={customerUploadedImage} alt="" className="h-full object-cover" />
                        </div>
                        <div className="space-y-1 max-w-xs truncate">
                          <p className="font-extrabold text-slate-800 truncate" title={customerUploadedFileName}>{customerUploadedFileName}</p>
                          <p className="text-[10px] text-slate-505 font-mono italic">
                            {customerUploadedPixels.w} &times; {customerUploadedPixels.h} pixels
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 pt-3 flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">Berekende Kwaliteit</span>
                          <span className={`text-[11px] font-black font-mono px-2 py-0.5 rounded leading-none ${
                            customerUploadedDpi >= 300 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-805'
                          }`}>
                            {customerUploadedDpi} DPI {customerUploadedDpi >= 300 ? '(Uitstekend!)' : '(Verbeterd)'}
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={isUploadingCustomerFile}
                          onClick={handleUploadCorruptedFile}
                          className="px-5 py-2 text-emerald-800 hover:text-white bg-emerald-50 hover:bg-emerald-700 disabled:bg-slate-200 border border-emerald-200 rounded-xl font-bold text-xs shadow-2xs cursor-pointer transition-all flex items-center gap-1.5"
                        >
                          {isUploadingCustomerFile ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          Bestand Opslaan &amp; Versturen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Custom history list timeline */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-4 text-left">
              <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5 font-sans">
                <Clock className="w-4 h-4 text-slate-600 shrink-0" />
                Bestellinghistorie &amp; Logboek
              </h3>
              <div className="border-l-2 border-slate-150 pl-5 space-y-5 py-1 text-xs">
                {(o.history || []).map((h: any, i: number) => {
                  const itemDate = new Date(h.date || Date.now());
                  const formattedLogDate = itemDate.toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <div key={i} className="relative space-y-1">
                      <span className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-slate-200 border-2 border-white ring-2 ring-slate-100"></span>
                      <div className="flex items-center gap-2 flex-wrap text-slate-400 font-mono text-[10px]">
                        <span className="font-extrabold text-slate-650">{formattedLogDate}</span>
                        <span>&bull;</span>
                        <span className="uppercase font-semibold tracking-wider">{h.status}</span>
                      </div>
                      <p className="text-slate-700 font-medium leading-relaxed bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">{h.note}</p>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* RIGHT: DETAILS PANEL & QR LINK */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Displaying Live QR code */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs text-center space-y-4 text-left">
              <h3 className="font-extrabold text-xs uppercase tracking-widest text-slate-400 font-sans block text-center">Unieke Status scan</h3>
              
              <div className="w-44 h-44 mx-auto bg-slate-50 border border-slate-150 rounded-2xl flex items-center justify-center p-2 shadow-inner">
                <img src={qrUrl} alt="Order QR" className="w-full h-full object-contain" />
              </div>

              <div className="space-y-3 text-center">
                <p className="text-[11px] text-slate-500 leading-normal px-1 font-sans">
                  Sla deze code op uw telefoon op om de preflight status overal live te volgen.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(trackingUrl);
                    alert('Status link gekopieerd naar klembord!');
                  }}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Kopieer status link
                </button>
              </div>
            </div>

            {/* Proefdruk download layer */}
            <div className="bg-[#0b1a30] text-slate-100 border border-slate-800 rounded-3xl p-6 shadow-3xs space-y-3.5 text-left">
              <div className="flex items-center gap-2">
                <Scissors className="w-4.5 h-4.5 text-blue-400 shrink-0" />
                <h3 className="font-extrabold text-sm text-slate-100">Layout Proefvel (SRA3)</h3>
              </div>

              <p className="text-xs text-slate-300 leading-normal leading-relaxed">
                Als pre-press controle kunt u direct een montageproef genereren op SRA3 formaat inclusief automatische snijmarkeringen en tussenruimtes van 2mm.
              </p>

              <button
                type="button"
                disabled={isGeneratingPdf}
                onClick={() => {
                  const itemForPdf = {
                    key: o.id,
                    imageSrcUrl: o.imageSrcUrl,
                    fileName: o.frontFileName || o.fileName || 'Bestand.png',
                    dpi: o.frontComputedDpi || 300,
                    side: o.printSides === 'double' ? 'Voorkant (A-zijde)' : 'Drukbestand (A-zijde)',
                    order: o
                  };
                  handleGeneratePdfAndDownload(itemForPdf);
                }}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-450 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isGeneratingPdf ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>PDF Proefvel Genereren...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4" />
                    <span>Download PDF Proefdruk (SRA3)</span>
                  </>
                )}
              </button>
            </div>

            {/* Specifications Details layout Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-4 text-left">
              <h3 className="font-extrabold text-slate-400 text-xs uppercase tracking-widest font-mono">Bestelling Gegevens</h3>
              
              <div className="space-y-3.5 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-xl space-y-0.5">
                  <span className="text-[9px] uppercase font-bold text-slate-400">Naam / Contactpersoon</span>
                  <p className="font-black text-slate-800">{o.clientName}</p>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl space-y-0.5">
                  <span className="text-[9px] uppercase font-bold text-slate-400">Gekozen Product</span>
                  <p className="font-extrabold text-slate-850">{o.selectedProductName}</p>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl space-y-0.5">
                  <span className="text-[9px] uppercase font-bold text-slate-400">Drukwerk Formaat</span>
                  <p className="font-mono font-bold text-slate-800">{o.customWidth} &times; {o.customHeight} mm</p>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl space-y-0.5">
                  <span className="text-[9px] uppercase font-bold text-slate-400">Uitvoering</span>
                  <p className="font-bold text-slate-800">{o.printSides === 'double' ? 'Dubbelzijdig (4/4 CMYK)' : 'Enkelzijdig (4/0 CMYK)'}</p>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl space-y-0.5">
                  <span className="text-[9px] uppercase font-bold text-slate-400">Aantal / Oplage</span>
                  <p className="font-bold text-slate-800">{o.clientQuantity ? `${o.clientQuantity} stuks` : '100 stuks (Standaard)'}</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  };

  if (trackedOrderId) {
    return renderTrackingPortal();
  }

  if (activePortal === 'landing') {
    return (
      <div className="min-h-screen bg-neutral-950 text-slate-100 flex flex-col justify-between p-6 sm:p-12 relative overflow-hidden font-sans select-none">
        {/* Abstract design blobs using brand red and charcoal darks */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-brand-red/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-pulse duration-4000"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-neutral-900 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>

        {/* Header */}
        <header className="w-full max-w-5xl mx-auto flex items-center justify-between z-10 py-2">
          <FDLogo lightText={true} />

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-brand-red/10 text-rose-400 border border-brand-red/20">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse"></span>
            FOGRA39 Compliant
          </span>
        </header>

        {/* Main Gateway choice card */}
        <main className="w-full max-w-4xl mx-auto my-auto z-10 py-8 text-center space-y-10">
          <div className="space-y-3">
            <div className="flex justify-center mb-4">
              <FDLogo iconOnly={true} className="w-20 h-20 filter drop-shadow-[0_0_15px_rgba(227,28,36,0.35)]" />
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white font-sans sm:text-5xl">
              Pre-Press Pro <span className="text-brand-red">Gateway</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-lg mx-auto font-sans font-medium">
              Welkom bij het pre-press controle- en beheercentrum van FD Printing Amsterdam. Selecteer de gewenste werkomgeving om door te gaan.
            </p>
          </div>

          {/* Dual-Card Menu Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto pt-4">
            {/* 1. KLANTPORTAAL CARD */}
            <motion.div 
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              className="h-full"
            >
              <button
                type="button"
                onClick={() => setActivePortal('client')}
                className="w-full h-full text-left bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-brand-red/60 rounded-3xl p-8 flex flex-col justify-between gap-6 cursor-pointer transition-all duration-300 shadow-xl group hover:shadow-brand-red/5 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-red/5 rounded-full blur-2xl group-hover:bg-brand-red/10 transition-colors"></div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="p-3 bg-brand-red/10 text-brand-red border border-brand-red/25 rounded-2xl">
                      <User className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-brand-red bg-brand-red/10 border border-brand-red/20 px-2.5 py-1 rounded-full">
                      Klantenservice
                    </span>
                  </div>
                  
                  <div className="space-y-1.5">
                    <h3 className="font-extrabold text-lg sm:text-xl text-white group-hover:text-brand-red transition-colors">
                      Klantportaal
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Start direct met het controleren van uw drukbestanden. Upload uw ontwerp, ontvang direct feedback over afloop en resolutie, en verstuur uw bestand direct voor productie.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 w-full text-xs font-bold text-brand-red group-hover:text-rose-400 transition-colors">
                  <span>Open preflight desk</span>
                  <span className="text-sm transform group-hover:translate-x-1.5 transition-transform">&rarr;</span>
                </div>
              </button>
            </motion.div>

            {/* 2. BEHEERDERSPORTAAL CARD */}
            <motion.div 
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              className="h-full"
            >
              <button
                type="button"
                onClick={() => {
                  setActivePortal('admin');
                  if (isAdminAuthenticated) {
                    fetchAdminOrders();
                  }
                }}
                className="w-full h-full text-left bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-white/40 rounded-3xl p-8 flex flex-col justify-between gap-6 cursor-pointer transition-all duration-300 shadow-xl group hover:shadow-white/5 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors"></div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="p-3 bg-white/5 text-white border border-white/10 rounded-2xl">
                      <Database className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
                      Backoffice
                    </span>
                  </div>
                  
                  <div className="space-y-1.5">
                    <h3 className="font-extrabold text-lg sm:text-xl text-white group-hover:text-slate-200 transition-colors">
                      Beheerders (Backoffice)
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Beveiligde werkomgeving voor FD Printing medewerkers. Bekijk binnengekomen bestanden, verwerk orders, raadpleeg klantinformatie, pas orderstatussen aan en download drukklaar gemaakte PDF's.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 w-full text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">
                  <span>Open beheerders backoffice</span>
                  <span className="text-sm transform group-hover:translate-x-1.5 transition-transform">&rarr;</span>
                </div>
              </button>
            </motion.div>
          </div>
        </main>

        {/* Footer */}
        <footer className="w-full max-w-5xl mx-auto flex items-center justify-between border-t border-slate-900/80 pt-6 text-[10px] text-slate-500 font-medium">
          <p>© {new Date().getFullYear()} FD Printing Center Amsterdam.</p>
          
          <div className="relative">
            {/* Subtle lock button as secondary entry */}
            <button
              onClick={() => {
                setActivePortal('admin');
                if (isAdminAuthenticated) {
                  fetchAdminOrders();
                }
              }}
              className="p-2 text-slate-600 hover:text-slate-400 rounded-lg hover:bg-slate-900/30 transition-all cursor-pointer flex items-center gap-1 group/btn focus:outline-hidden"
              title="Beheerder"
            >
              <Lock className="w-3 h-3 text-slate-600 group-hover/btn:text-slate-400 transition-colors" />
              <span className="text-[10px] font-semibold opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap text-slate-400 select-none">
                Medewerkers login
              </span>
            </button>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden">
      
      {/* SaaS Premium Header bar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div 
            onClick={() => setActivePortal('landing')}
            className="cursor-pointer group"
            title="Klik hier om terug te gaan naar het Hoofdmenu"
          >
            <FDLogo />
          </div>
 
          {/* Premium Portal Switching Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50 max-w-md">
            <button
              onClick={() => setActivePortal('landing')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activePortal === 'landing'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Grid className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Hoofdmenu</span>
            </button>
            <button
              onClick={() => setActivePortal('client')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activePortal === 'client'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <User className="w-3.5 h-3.5 text-brand-red" />
              <span>Klantportaal</span>
            </button>
            <button
              onClick={() => {
                setActivePortal('admin');
                if (isAdminAuthenticated) {
                  fetchAdminOrders();
                }
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activePortal === 'admin'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-slate-500" />
              <span>Beheerders</span>
            </button>
          </div>
 
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-brand-red border border-red-100">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-red animate-ping"></span>
              FOGRA39 Compliant
            </span>
            <div className="text-xs text-slate-400 font-medium hidden md:block font-mono">
              admin@fdprinting.nl
            </div>
          </div>
        </div>
      </header>

      {/* Main SaaS Dashboard content area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        
        {activePortal === 'client' ? (
          <>
            {/* Welcome Section */}
            <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 font-sans">
              <div>
                <h2 style={{ color: '#ed1c24' }} className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                  File Check Desk
                </h2>
                <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                  Controleer direct uw beeldvullende afloop, verhoudingen en DPI-resolutie om de beste printkwaliteit te garanderen.
                </p>
              </div>
              
              <div className="flex items-center gap-2 text-xs font-semibold bg-red-50 text-brand-red p-3 rounded-xl border border-red-100 self-start md:self-center">
                <Sparkles className="w-4 h-4 text-brand-red animate-spin" style={{ animationDuration: '4s' }} />
                <span>Real-time verificatie van beeldverhoudingen en pixelafmetingen actief.</span>
              </div>
            </div>

            {/* Interactive Pre-press Guide Banner */}
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-3xl p-5 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-3xs relative overflow-hidden animate-fade-in font-sans">
              <div className="absolute right-0 top-0 opacity-10 font-black text-6xl text-emerald-800 pointer-events-none select-none font-mono">
                STAP {clientActiveStep}
              </div>
              
              <div className="flex gap-4 items-start select-none">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-xs sm:text-sm shrink-0 shadow-sm">
                  Gids
                </div>
                <div className="space-y-1 text-left">
                  <h3 className="font-extrabold text-xs sm:text-sm text-emerald-950 flex items-center gap-2">
                    Interactieve Preflight Begeleiding &bull; Stap {clientActiveStep} van 4
                  </h3>
                  <p className="text-[11px] sm:text-xs text-emerald-800 font-semibold leading-relaxed">
                    {stepGuidanceMessage}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end md:self-center">
                <button
                  type="button"
                  onClick={() => advanceToStep(clientActiveStep, stepGuidanceMessage)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-3xs transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  Breng mij naar Stap {clientActiveStep} &rarr;
                </button>
              </div>
            </div>
            {/* Dynamic Pre-press Stappenplan (Done in Green, Active in Blue, Pending in Slate/Grey) */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-3xs mb-8">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2 select-none">
                <span>Klik op een stap om te navigeren:</span>
                <span className="h-px bg-slate-100 flex-1"></span>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                {/* Step 1: Product type selecteren */}
                <button
                  type="button"
                  onClick={() => {
                    setClientActiveStep(1);
                    setStepGuidanceMessage("Stap 1: Kies het gewenste producttype dat u wilt laten controleren.");
                  }}
                  className={`flex items-start gap-3 text-left p-2 rounded-xl transition-all cursor-pointer ${
                    clientActiveStep === 1 
                      ? 'bg-red-50/50 border border-red-100/50 shadow-4xs font-semibold' 
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 font-bold text-xs sm:text-sm shadow-xs border border-emerald-400">
                    ✓
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="font-extrabold text-[10px] sm:text-xs text-emerald-800 uppercase tracking-tight">Stap 1: Product</h4>
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-700 leading-tight">Product kiezen</p>
                    <p className="text-[9px] text-slate-500 leading-tight font-medium truncate max-w-[100px] sm:max-w-none font-sans">
                      {selectedProduct.category}
                    </p>
                  </div>
                </button>

                {/* Step 2: Formaat en opties selecteren */}
                <button
                  type="button"
                  onClick={() => {
                    setClientActiveStep(2);
                    setStepGuidanceMessage("Stap 2: Kies uw formaat en specificaties.");
                  }}
                  className={`flex items-start gap-3 text-left p-2 rounded-xl transition-all cursor-pointer ${
                    clientActiveStep === 2 
                      ? 'bg-red-50/50 border border-red-100/50 shadow-4xs font-semibold' 
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs sm:text-sm shadow-xs border transition-colors ${
                    clientActiveStep >= 2
                      ? 'bg-emerald-500 text-white border-emerald-400' 
                      : 'bg-slate-200 text-slate-505 border-slate-300'
                  }`}>
                    {clientActiveStep > 2 ? '✓' : '2'}
                  </div>
                  <div className="space-y-0.5">
                    <h4 className={`font-extrabold text-[10px] sm:text-xs uppercase tracking-tight ${clientActiveStep >= 2 ? 'text-emerald-800' : 'text-slate-500'}`}>
                      Stap 2: Formaat
                    </h4>
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-700 leading-tight">Formaat bepalen</p>
                    <p className="text-[9px] text-slate-505 leading-tight font-medium truncate max-w-[100px] sm:max-w-none">
                      {selectedProduct.name}
                    </p>
                  </div>
                </button>

                {/* Step 3: Ontwerp inladen */}
                <button
                  type="button"
                  onClick={() => {
                    setClientActiveStep(3);
                    setStepGuidanceMessage("Stap 3: Sleep uw drukbestand naar de uploadzone.");
                  }}
                  className={`flex items-start gap-3 text-left p-2 rounded-xl transition-all cursor-pointer ${
                    clientActiveStep === 3 
                      ? 'bg-red-50/50 border border-red-100/50 shadow-4xs font-semibold' 
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs sm:text-sm shadow-xs border transition-colors ${
                    activeFile 
                      ? 'bg-emerald-500 text-white border-emerald-400' 
                      : clientActiveStep === 3
                        ? 'bg-brand-red text-white border-brand-red animate-pulse'
                        : 'bg-slate-200 text-slate-505 border-slate-300'
                  }`}>
                    {activeFile ? '✓' : '3'}
                  </div>
                  <div className="space-y-0.5">
                    <h4 className={`font-extrabold text-[10px] sm:text-xs uppercase tracking-tight ${activeFile ? 'text-emerald-800' : 'text-slate-500'}`}>
                      Stap 3: Upload
                    </h4>
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-700 leading-tight">
                      {activeFile ? 'Bestand geladen' : 'Bestand kiezen'}
                    </p>
                    <p className="text-[9px] text-slate-505 leading-tight font-medium truncate max-w-[100px] sm:max-w-none">
                      {activeFile ? activeFile.name : 'PNG of JPG'}
                    </p>
                  </div>
                </button>

                {/* Step 4: Preflight check */}
                <button
                  type="button"
                  disabled={!activeFile}
                  onClick={() => {
                    if (activeFile) {
                      setClientActiveStep(4);
                      setStepGuidanceMessage("Stap 4: Bekijk de preflight controle resultaten en controleer uw drukbestand.");
                    }
                  }}
                  className={`flex items-start gap-3 text-left p-2 rounded-xl transition-all ${
                    !activeFile 
                      ? 'opacity-65 cursor-not-allowed' 
                      : clientActiveStep === 4
                        ? 'bg-red-50/50 border border-red-100/50 shadow-4xs font-semibold'
                        : 'hover:bg-slate-50 border border-transparent cursor-pointer'
                  }`}
                >
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs sm:text-sm shadow-xs border transition-colors ${
                    !activeFile 
                      ? 'bg-slate-100 text-slate-400 border-slate-200' 
                      : analysisResult?.feedbackState === 'success'
                        ? 'bg-emerald-500 text-white border-emerald-400'
                        : 'bg-rose-500 text-white border-rose-400'
                  }`}>
                    {!activeFile ? '4' : analysisResult?.feedbackState === 'success' ? '✓' : '!'}
                  </div>
                  <div className="space-y-0.5">
                    <h4 className={`font-extrabold text-[10px] sm:text-xs uppercase tracking-tight ${
                      !activeFile 
                        ? 'text-slate-400' 
                        : analysisResult?.feedbackState === 'success'
                          ? 'text-emerald-800 font-bold'
                          : 'text-rose-600 font-bold'
                    }`}>
                      Stap 4: Controle
                    </h4>
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-700 leading-tight">
                      {!activeFile ? 'Controle' : analysisResult?.feedbackState === 'success' ? 'Alles akkoord' : 'Aandacht vereist'}
                    </p>
                    <p className="text-[9px] text-slate-550 leading-tight font-medium">
                      {!activeFile ? 'Wacht op bestand' : analysisResult?.feedbackState === 'success' ? 'Drukkerijklaar!' : 'Bekijk details'}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Conditional step-by-step display */}
            <div className="w-full">
              {clientActiveStep === 1 && (
                <div id="step-1-section" className="max-w-4xl mx-auto animate-fade-in pb-12">
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <ProductCategorySelector
                      selectedCategory={selectedProduct?.category || null}
                      onSelectCategory={(categoryId) => {
                        const categoryProducts = STANDARD_PRODUCTS.filter((p) => p.category === categoryId);
                        if (categoryProducts.length > 0) {
                          handleSelectProduct(categoryProducts[0]);
                        }
                        advanceToStep(2, "Stap 2: Kies uw gewenste formaat en specificaties.");
                      }}
                    />
                  </motion.div>
                </div>
              )}

              {clientActiveStep === 2 && (
                <div id="step-2-section" className="max-w-4xl mx-auto animate-fade-in pb-12">
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <ProductFormatSelector
                      products={STANDARD_PRODUCTS}
                      selectedProduct={selectedProduct}
                      onSelectProduct={handleSelectProduct}
                      customWidth={customWidth}
                      customHeight={customHeight}
                      onChangeWidth={setCustomWidth}
                      onChangeHeight={setCustomHeight}
                      stickerShape={stickerShape}
                      onSetStickerShape={setStickerShape}
                      printSides={printSides}
                      onChangePrintSides={handleChangePrintSides}
                      onNextStep={() => {
                        advanceToStep(3, "Stap 3: Sleep of kies uw bestand voor automatische preflight controle.");
                      }}
                      onPrevStep={() => {
                        advanceToStep(1, "Stap 1: Kies het gewenste producttype.");
                      }}
                    />
                  </motion.div>
                </div>
              )}

              {clientActiveStep === 3 && (
                <div id="step-3-section" className="max-w-3xl mx-auto space-y-6 animate-fade-in pb-12">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-3xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        advanceToStep(2, "Stap 2: Kies uw gewenste formaat en afmetingen.");
                      }}
                      className="inline-flex items-center justify-center gap-2 text-xs font-extrabold text-slate-600 hover:text-blue-600 transition-colors bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3.5 py-2 rounded-xl cursor-pointer"
                    >
                      <span className="text-base">&larr;</span>
                      <span>Terug naar Formaatkeuze</span>
                    </button>
                    
                    <span className="text-xs font-bold text-slate-505 text-center sm:text-right font-sans">
                      Specificaties: <strong className="text-slate-800 font-extrabold">{selectedProduct.name} ({customWidth}x{customHeight}mm)</strong>
                    </span>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <UploadDropzone
                      onFileLoaded={handleFileLoaded}
                      activeFileName={activeFile?.name || null}
                      activeFileSize={activeFile?.size || null}
                      activeFileType={activeFile?.type || null}
                      backActiveFileName={backActiveFile?.name || null}
                      backActiveFileSize={backActiveFile?.size || null}
                      backActiveFileType={backActiveFile?.type || null}
                      onClearFile={handleClearFile}
                      printSides={printSides}
                    />
                  </motion.div>

                  <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        advanceToStep(2, "Stap 2: Kies uw gewenste formaat en afmetingen.");
                      }}
                      className="w-full sm:w-auto bg-slate-100 hover:bg-slate-250 text-slate-800 font-extrabold text-xs py-3.5 px-6 rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span className="text-base">&larr;</span>
                      <span>Vorige stap (Formaat)</span>
                    </button>

                    {activeFile && (
                      <button
                        type="button"
                        onClick={() => {
                          advanceToStep(4, "Stap 4: Bekijk hier de resultaten van de automatische controle.");
                        }}
                        className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3.5 px-6 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer border-none font-sans"
                      >
                        <span>Volgende: preflight controle bekijken</span>
                        <span className="text-base">&rarr;</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {clientActiveStep === 4 && (
                <div id="step-4-section" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fade-in w-full pb-12">
                  
                  {/* LEFT Column: Interactive Canvas preview */}
                  <div className="lg:col-span-7 space-y-6">
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      <LiveFilePreview
                        selectedProduct={selectedProduct}
                        widthMm={customWidth}
                        heightMm={customHeight}
                        imageSrcUrl={imageSrcUrl}
                        backImageSrcUrl={backImageSrcUrl}
                        frontFitMode={frontFitMode}
                        backFitMode={backFitMode}
                        onSetFrontFitMode={setFrontFitMode}
                        onSetBackFitMode={setBackFitMode}
                        frontRotationDegrees={frontRotationDegrees}
                        backRotationDegrees={backRotationDegrees}
                        activeFocusedSide={activeFocusedSide}
                        onActiveFocusedSideChange={setActiveFocusedSide}
                        pixelWidth={filePixelWidth}
                        pixelHeight={filePixelHeight}
                        backPixelWidth={backFilePixelWidth}
                        backPixelHeight={backFilePixelHeight}
                        stickerShape={stickerShape}
                        isPdf={activeFile?.type === 'application/pdf' || activeFile?.name?.endsWith('.pdf')}
                        printSides={printSides}
                        pdfPages={pdfPages}
                        selectedFrontPageIdx={selectedFrontPageIdx}
                        selectedBackPageIdx={selectedBackPageIdx}
                        onSelectFrontPageIdx={handleDropPdfPage}
                        onSelectBackPageIdx={(idx) => handleDropPdfPage(idx, 'back')}
                        onDropPdfPage={handleDropPdfPage}
                        onDropLocalFile={handleDropLocalFile}
                        activeFileName={activeFile?.name || null}
                        backActiveFileName={backActiveFile?.name || null}
                        onClearFile={handleClearFile}
                        onSwapSides={handleSwapSides}
                      />
                    </motion.div>
                  </div>

                  {/* RIGHT Column: Preflight analysis & actions */}
                  <div className="lg:col-span-5 space-y-6">
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.1 }}
                    >
                      <FeedbackPanel
                        analysis={analysisResult}
                        prototypeOverride={prototypeOverride}
                        onSetPrototypeOverride={setPrototypeOverride}
                        onRotateFile={handleRotate90}
                        onReupload={() => {
                          handleClearFile();
                          advanceToStep(3, "Upload uw bestand.");
                        }}
                        onProceedAnyway={() => setProceedAnywayAlert(true)}
                        onSendToPrint={() => {
                          setStepGuidanceMessage("Vul hieronder uw contactgegevens in om uw gecontroleerde bestanden direct in te dienen.");
                          setIsClientFormOpen(true);
                        }}
                      />
                    </motion.div>

                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          advanceToStep(3, "Stap 3: Upload uw ontwerpbestand voor de automatische kwaliteitscontrole.");
                        }}
                        className="w-full bg-slate-100 hover:bg-slate-250 text-slate-800 font-extrabold text-xs py-3.5 px-4 rounded-xl border border-slate-200/80 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                      >
                        <span className="text-base">&larr;</span>
                        <span>Terug naar upload</span>
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </div>
          </>
        ) : (
          /* Beheerdersportaal (Backoffice) layout block */
          <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-800 font-sans flex items-center gap-2.5">
                  <Lock className="w-6 h-6 text-slate-800" />
                  Beheerders backoffice
                </h2>
                <p className="text-sm text-slate-500 mt-1 font-sans">
                  Beheer, controleer en download klantspecifieke drukbestanden met de bijhorende klantinformatie.
                </p>
              </div>
              
              {isAdminAuthenticated && (
                <button
                  type="button"
                  onClick={() => {
                    setIsAdminAuthenticated(false);
                    sessionStorage.removeItem('fd_admin_authed');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                >
                  Uitloggen
                </button>
              )}
            </div>

            {!isAdminAuthenticated ? (
              /* Verification Lock Screen */
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-8 shadow-md my-12"
              >
                <div className="text-center space-y-4">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-700 border border-slate-150">
                    <Key className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold text-slate-900">Beveiligde Toegang</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Voer het beheerder wachtwoord in om de geüploade bestanden en persoonsgegevens in te zien.
                    </p>
                  </div>
                  <form onSubmit={handleAdminLogin} className="space-y-3">
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                      <input
                        type="password"
                        placeholder="Voer wachtwoord in..."
                        value={adminPasswordInput}
                        onChange={(e) => setAdminPasswordInput(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-250 rounded-xl text-sm focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all text-center font-bold tracking-widest text-slate-900"
                        autoFocus
                      />
                    </div>
                    {adminAuthError && (
                      <p className="text-[11px] font-bold text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-100">
                        {adminAuthError}
                      </p>
                    )}
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Verifieer Access Code
                    </button>
                  </form>
                  <p className="text-[10px] text-slate-400">
                     Tip: het beheerderswachtwoord is <span className="font-mono font-bold select-all bg-slate-50 px-1 py-0.5 rounded border border-slate-200">FD2026</span>
                  </p>
                </div>
              </motion.div>
            ) : (
              /* Authenticated Admin Dashboard */
              <div className="space-y-6">
                
                {/* Stats cards summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex items-center justify-between shadow-3xs">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 font-sans tracking-wide block">Totaal Inzendingen</span>
                      <h4 className="text-2xl font-black text-slate-900 font-sans">{orders.length}</h4>
                    </div>
                    <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-black text-xs font-mono">
                      {orders.length}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex items-center justify-between shadow-3xs">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 font-sans tracking-wide block">Dubbelzijdige Inzendingen</span>
                      <h4 className="text-2xl font-black text-slate-900 font-sans">
                        {orders.filter(o => o.printSides === 'double').length}
                      </h4>
                    </div>
                    <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center text-amber-600 text-sm">
                      ↕
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 flex items-center justify-between shadow-3xs">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 font-sans tracking-wide block">Systeem status</span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100 mt-1 max-w-fit font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                        Synchroniseren Actief
                      </span>
                    </div>
                    <div className="w-10 h-10 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 font-bold">
                      ✓
                    </div>
                  </div>
                </div>

                {/* Backoffice Sub-nav Tabs */}
                <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-xl border border-slate-200/50 max-w-2xl select-none font-sans gap-2">
                  <button
                    onClick={() => setAdminSubTab('files')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 focus:outline-hidden ${
                      adminSubTab === 'files'
                        ? 'bg-slate-900 text-white shadow-xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-500 font-bold" />
                    <span>Bestanden &amp; SRA3</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${adminSubTab === 'files' ? 'bg-slate-800 text-slate-100' : 'bg-slate-250 text-slate-650'}`}>
                      {parsedFilesList.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setAdminSubTab('orders')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 focus:outline-hidden ${
                      adminSubTab === 'orders'
                        ? 'bg-slate-900 text-white shadow-xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                    <span>Orders Overzicht</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${adminSubTab === 'orders' ? 'bg-slate-800 text-slate-100' : 'bg-slate-250 text-slate-650'}`}>
                      {orders.length}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setAdminSubTab('staff');
                      fetchAdminStaff();
                    }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 focus:outline-hidden ${
                      adminSubTab === 'staff'
                        ? 'bg-slate-900 text-white shadow-xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-emerald-550" />
                    <span>Personeel &amp; Operator Status</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${adminSubTab === 'staff' ? 'bg-slate-800 text-slate-100' : 'bg-slate-250 text-slate-650'}`}>
                      {staffList.length}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setAdminSubTab('create_order');
                      setManualCreatedOrder(null);
                    }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 focus:outline-hidden ${
                      adminSubTab === 'create_order'
                        ? 'bg-slate-950 text-white shadow-xs font-extrabold'
                        : 'text-slate-505 hover:text-slate-800 hover:bg-slate-50 border border-transparent hover:border-slate-205'
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-rose-500" />
                    <span className="text-slate-650 font-bold">Handmatige Opdracht</span>
                  </button>
                </div>

                {adminSubTab === 'files' ? (
                  /* DIRECT FILES WORKSPACE VIEW */
                  <div className="space-y-6 animate-fade-in font-sans">
                    {/* Filter controls */}
                    <div className="bg-white p-4 border border-slate-200/80 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-3xs select-none">
                      <div className="relative w-full md:w-80 font-sans">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                        <input
                          type="text"
                          placeholder="Zoek op bestandsnaam, order of klant..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white"
                        />
                      </div>

                      <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto select-none">
                        <span className="text-xs text-slate-400 flex items-center gap-1 mr-1 shrink-0 font-bold font-sans">
                          <Filter className="w-3 h-3" /> Filter:
                        </span>
                        {['All', 'Flyer', 'Poster', 'Sticker', 'Visitekaart', 'Custom'].map((cat) => (
                          <button
                            key={cat}
                            onClick={() => setAdminCategoryFilter(cat)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-all focus:outline-hidden ${
                              adminCategoryFilter === cat
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/60'
                            }`}
                          >
                            {cat === 'All' ? 'Alle Producten' : cat === 'Visitekaart' ? 'Visitekaarten' : cat}
                          </button>
                        ))}

                        <button
                          type="button"
                          onClick={fetchAdminOrders}
                          disabled={isLoadingOrders}
                          className="p-1.5 ml-1 bg-slate-50 hover:bg-slate-150 border border-slate-200 rounded-lg shrink-0 transition-all cursor-pointer text-slate-600 focus:outline-hidden"
                          title="Herladen"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Highly overzichtelijk bulk operations bar */}
                    {filteredFiles.length > 0 && (
                      <div className="bg-slate-900 text-white px-5 py-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm select-none border border-slate-800 font-sans">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              const listKeys = filteredFiles.map(f => f.key);
                              const allSelected = listKeys.every(k => selectedFileKeys.includes(k));
                              if (allSelected) {
                                setSelectedFileKeys(prev => prev.filter(k => !listKeys.includes(k)));
                              } else {
                                setSelectedFileKeys(prev => Array.from(new Set([...prev, ...listKeys])));
                              }
                            }}
                            className="text-white hover:text-blue-400 transition-colors cursor-pointer focus:outline-hidden"
                            title="Selecteer alles"
                          >
                            {filteredFiles.map(f => f.key).every(k => selectedFileKeys.includes(k)) ? (
                              <CheckSquare className="w-5 h-5 text-blue-400" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-400" />
                            )}
                          </button>
                          <div className="space-y-0.5 font-sans">
                            <span className="text-[10px] uppercase font-black tracking-wider text-blue-400 block font-mono">Bewerken op selectie</span>
                            <p className="text-xs text-slate-300">
                              <span className="font-bold text-white font-mono">{selectedFileKeys.filter(k => filteredFiles.some(f => f.key === k)).length}</span> van de {filteredFiles.length} geüploade bestanden geselecteerd
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {selectedFileKeys.filter(k => filteredFiles.some(f => f.key === k)).length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const listKeys = filteredFiles.map(f => f.key);
                                setSelectedFileKeys(prev => prev.filter(k => !listKeys.includes(k)));
                              }}
                              className="px-3 py-1.5 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer focus:outline-hidden"
                            >
                              Selectie wissen
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={selectedFileKeys.filter(k => filteredFiles.some(f => f.key === k)).length === 0}
                            onClick={() => {
                              const selectedFiles = filteredFiles.filter((f) => selectedFileKeys.includes(f.key));
                              selectedFiles.forEach((fileItem, idx) => {
                                setTimeout(() => {
                                  downloadSingleFile(fileItem);
                                }, idx * 350);
                              });
                            }}
                            className={`px-4 py-2 font-black text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer focus:outline-hidden ${
                              selectedFileKeys.filter(k => filteredFiles.some(f => f.key === k)).length > 0
                                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                                : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed'
                            }`}
                          >
                            <FileDown className="w-4 h-4" />
                            Bulk Download ({selectedFileKeys.filter(k => filteredFiles.some(f => f.key === k)).length})
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Files High-Density Table */}
                    {filteredFiles.length === 0 ? (
                      <div className="text-center py-16 bg-white border border-slate-200 border-dashed rounded-3xl space-y-3 select-none">
                        <FolderOpen className="w-12 h-12 text-slate-300 mx-auto animate-pulse" />
                        <div className="space-y-1">
                          <h4 className="font-bold text-slate-700 text-sm">Geen geüploade bestanden gevonden</h4>
                          <p className="text-xs text-slate-400 max-w-xs mx-auto px-4 leading-normal">
                            Er zijn momenteel geen bestanden in de backoffice database die voldoen aan de filters of geselecteerde categorie.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-3xs">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse font-sans text-xs">
                            <thead>
                              <tr className="bg-slate-50/70 border-b border-slate-200 text-[10px] font-black uppercase text-slate-400 tracking-wider select-none">
                                <th className="py-3.5 px-4 w-12 text-center">Export</th>
                                <th className="py-3.5 px-3 w-16">Miniatuur</th>
                                <th className="py-3.5 px-4 border-l border-slate-100">Bestandsnaam &amp; Type</th>
                                <th className="py-3.5 px-4">Formaat &amp; Layout</th>
                                <th className="py-3.5 px-4">Kwaliteit (DPI)</th>
                                <th className="py-3.5 px-4">Klant &amp; Referentie</th>
                                <th className="py-3.5 px-4 text-right">Acties</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {filteredFiles.map((f) => {
                                const isLowDpi = f.dpi < 300;
                                const isSelected = selectedFileKeys.includes(f.key);
                                const formatMm = `${f.order.customWidth}x${f.order.customHeight} mm`;
                                
                                return (
                                  <tr key={f.key} className={`hover:bg-slate-50/70 transition-all ${isSelected ? 'bg-blue-50/20' : ''}`}>
                                    {/* Action Selector */}
                                    <td className="py-4 px-4 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleSelectFile(f.key)}
                                        className="text-slate-400 hover:text-blue-600 transition-colors cursor-pointer focus:outline-hidden"
                                      >
                                        {isSelected ? (
                                          <CheckSquare className="w-4 h-4 text-blue-650 mx-auto" />
                                        ) : (
                                          <Square className="w-4 h-4 text-slate-300 mx-auto" />
                                        )}
                                      </button>
                                    </td>

                                    {/* Interactive zoom design frame */}
                                    <td className="py-4 px-3">
                                      <div 
                                        onClick={() => setPreviewFile(f)}
                                        className="w-10 h-14 bg-white border border-slate-300 rounded-md overflow-hidden relative flex items-center justify-center shrink-0 cursor-zoom-in group shadow-4xs"
                                        title="Snel overzicht preflight"
                                      >
                                        <img
                                          src={f.imageSrcUrl}
                                          alt={f.fileName}
                                          className="h-full object-cover group-hover:scale-105 transition-transform"
                                          style={{ transform: `rotate(${f.rotation || 0}deg)` }}
                                        />
                                        <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                          <Eye className="w-3.5 h-3.5 text-white filter drop-shadow-sm" />
                                        </div>
                                      </div>
                                    </td>

                                    {/* File details column */}
                                    <td className="py-4 px-4 font-medium max-w-[220px] border-l border-slate-100">
                                      <div className="truncate font-extrabold text-slate-850 text-[12px]" title={f.fileName}>
                                        {f.fileName}
                                      </div>
                                      <div className="mt-1.5 flex items-center gap-1.5">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                          f.side.includes('Voorkant')
                                            ? 'bg-blue-50 text-blue-800 border border-blue-150'
                                            : 'bg-indigo-50 text-indigo-850 border border-indigo-150'
                                        }`}>
                                          {f.side.includes('Voorkant') ? 'A-Zijde (Voor)' : 'B-Zijde (Achter)'}
                                        </span>
                                      </div>
                                    </td>

                                    {/* Print specification */}
                                    <td className="py-4 px-4">
                                      <div className="font-extrabold text-slate-800 capitalize flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                        {f.order.selectedProductCategory === 'Visitekaart' ? 'Visitekaarten' : f.order.selectedProductCategory}
                                      </div>
                                      <div className="text-[10px] text-slate-450 font-mono font-bold mt-1">
                                        Formaat: {formatMm}
                                      </div>
                                    </td>

                                    {/* Prepress resolution status */}
                                    <td className="py-4 px-4">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`px-2 py-0.5 rounded-md font-bold font-mono text-[10px] border ${
                                          isLowDpi
                                            ? 'bg-rose-50 text-rose-700 border-rose-100'
                                            : 'bg-emerald-50 text-emerald-850 border border-emerald-150'
                                        }`}>
                                          {f.dpi} DPI
                                        </span>
                                        <span className="text-[10px] text-slate-400 hidden lg:inline">
                                          {isLowDpi ? '⚠️ Te laag' : '✓ OK'}
                                        </span>
                                      </div>
                                    </td>

                                    {/* Connected Customer & Order context */}
                                    <td className="py-4 px-4">
                                      <div className="font-black text-slate-800 flex items-center gap-1.5 leading-tight">
                                        <span className="truncate max-w-[120px]">{f.order.clientName}</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard.writeText(`${f.order.clientName} (${f.order.clientEmail})`);
                                            alert('Klant contactgegevens gekopieerd!');
                                          }}
                                          className="text-slate-350 hover:text-slate-550 cursor-pointer focus:outline-hidden"
                                          title="E-mail &amp; naam kopiëren"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <div className="text-[10px] text-slate-505 font-mono font-bold mt-1 flex items-center gap-1">
                                        <span className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200/60 font-black text-slate-750">{f.id}</span>
                                        {f.order.clientReference && (
                                          <span className="text-[9px] text-slate-400 truncate max-w-[90px]" title={f.order.clientReference}>
                                            Ref: {f.order.clientReference}
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    {/* Action items column */}
                                    <td className="py-4 px-4 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setPreviewFile(f)}
                                          className="p-1.5 bg-slate-50 hover:bg-slate-150 hover:text-slate-850 text-slate-500 rounded-lg border border-slate-200 transition-all cursor-pointer shadow-3xs focus:outline-hidden"
                                          title="Preflight beeldscherm"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => downloadSingleFile(f)}
                                          className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-805 rounded-lg border border-blue-100 transition-all cursor-pointer shadow-3xs flex items-center gap-1 font-bold focus:outline-hidden"
                                          title="Genereer &amp; download drukbestand"
                                        >
                                          <FileDown className="w-3.5 h-3.5" />
                                          <span className="hidden sm:inline">Download</span>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : adminSubTab === 'orders' ? (
                  /* ORIGINAL ORDERS LISTING WORKSPACE VIEW */
                  <>
                    {/* Filter and search bar controls */}
                    <div className="bg-white p-4 border border-slate-200/80 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-3xs">
                  <div className="relative w-full md:w-80">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      placeholder="Zoek op naam, e-mail of order ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto select-none">
                    <span className="text-xs text-slate-400 flex items-center gap-1 mr-1 shrink-0 font-bold font-sans">
                      <Filter className="w-3 h-3" /> Filter:
                    </span>
                    {['All', 'Flyer', 'Poster', 'Sticker', 'Visitekaart', 'Custom'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setAdminCategoryFilter(cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                          adminCategoryFilter === cat
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200/60'
                        }`}
                      >
                        {cat === 'All' ? 'Alle Producten' : cat === 'Visitekaart' ? 'Visitekaarten' : cat}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={fetchAdminOrders}
                      disabled={isLoadingOrders}
                      className="p-1.5 ml-1 bg-slate-50 hover:bg-slate-150 border border-slate-200 rounded-lg shrink-0 transition-all cursor-pointer text-slate-600"
                      title="Herladen"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Order Cards Flow */}
                {isLoadingOrders ? (
                  <div className="text-center py-16 space-y-3">
                    <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                    <p className="text-xs text-slate-400 font-sans">Verbinding maken met server. Bestellingen synchroniseren...</p>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-16 bg-white border border-slate-250 border-dashed rounded-3xl space-y-2 max-w-full">
                    <Database className="w-10 h-10 text-slate-300 mx-auto" />
                    <h4 className="font-bold text-slate-700 text-sm">Geen orders gevonden</h4>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto px-4">
                      Er zijn momenteel geen geüploade drukorders in de backoffice database.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {orders
                      .filter((o) => {
                        const sq = searchQuery.toLowerCase();
                        const matchesSearch =
                          o.id.toLowerCase().includes(sq) ||
                          (o.clientName?.toLowerCase().includes(sq) || '') ||
                          (o.clientEmail?.toLowerCase().includes(sq) || '') ||
                          (o.clientReference?.toLowerCase().includes(sq) || '');
                        
                        const matchesCategory =
                          adminCategoryFilter === 'All' ||
                          (o.selectedProductCategory?.toLowerCase() === adminCategoryFilter.toLowerCase());

                        return matchesSearch && matchesCategory;
                      })
                      .map((order) => {
                        const createDate = new Date(order.createdAt || Date.now());
                        const formattedDate = createDate.toLocaleDateString('nl-NL', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        });

                        return (
                          <div
                            key={order.id}
                            className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden hover:border-slate-300 transition-all"
                          >
                            {/* Order Header banner */}
                            <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
                              <div className="flex items-center gap-3">
                                <span className="font-black text-sm tracking-wide text-white font-mono bg-slate-900 px-3 py-1 rounded-md">
                                  {order.id}
                                </span>
                                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5 font-mono">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  {formattedDate}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                                  order.printSides === 'double'
                                    ? 'bg-amber-50 text-amber-850 border-amber-200'
                                    : 'bg-blue-50 text-blue-805 border-blue-200'
                                }`}>
                                  {order.printSides === 'double' ? '↕ DUBBELZIJDIG' : '↑ ENKELZIJDIG'}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteOrder(order.id)}
                                  className="p-1.5 bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-250 text-slate-450 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                  title="Bestelling Verwijderen"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Order Details Grid layout */}
                            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                              {/* Left Info Column: Client Info */}
                              <div className="lg:col-span-4 space-y-4 border-r border-slate-100 pr-0 lg:pr-6">
                                <h5 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 font-sans flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-slate-400" /> Klantgegevens
                                </h5>

                                <div className="space-y-3 text-xs">
                                  <div className="space-y-0.5 bg-slate-50 p-2.5 rounded-xl">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Naam / Bedrijfsnaam</span>
                                    <p className="font-bold text-slate-800">{order.clientName}</p>
                                  </div>

                                  <div className="space-y-0.5 bg-slate-50 p-2.5 rounded-xl">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">E-mailadres</span>
                                    <a href={`mailto:${order.clientEmail}`} className="block font-bold text-blue-700 hover:underline">
                                      {order.clientEmail}
                                    </a>
                                  </div>

                                  <div className="space-y-0.5 bg-slate-50 p-2.5 rounded-xl">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Telefoonnummer</span>
                                    <p className="font-bold text-slate-800">{order.clientPhone}</p>
                                  </div>

                                  {order.clientReference && (
                                    <div className="space-y-0.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200/50">
                                      <span className="text-[10px] uppercase font-bold text-slate-400">Referentienummer</span>
                                      <p className="font-mono font-bold text-slate-800">{order.clientReference}</p>
                                    </div>
                                  )}

                                  <div className="space-y-0.5 bg-slate-50 p-2.5 rounded-xl block">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Aantal / Oplage</span>
                                    <p className="font-bold text-slate-800">{order.clientQuantity ? `${order.clientQuantity} stuks` : '100 stuks (Standaard)'}</p>
                                  </div>

                                  <div className="space-y-1 block pt-2 border-t border-slate-100 font-sans">
                                    <span className="text-[10px] uppercase font-extrabold text-slate-500 block mb-1">Toegewezen Personeelslid</span>
                                    <select
                                      value={order.assignedStaff || ''}
                                      onChange={(e) => handleAssignStaff(order.id, e.target.value)}
                                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-semibold text-slate-705 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                    >
                                      <option value="">-- Geen operator zugewezen --</option>
                                      {staffList.map((m) => (
                                        <option key={m.id} value={m.name}>
                                          {m.name} ({m.role})
                                        </option>
                                      ))}
                                    </select>
                                    
                                    {order.assignedStaff ? (
                                      <div className="text-[10px] text-emerald-800 font-extrabold bg-emerald-50 px-2 py-1.5 rounded-lg border border-emerald-100 mt-2 block w-full text-center">
                                        ✓ Behandeld door: {order.assignedStaff}
                                      </div>
                                    ) : (
                                      <div className="text-[10px] text-amber-805 bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-100 mt-2 block w-full text-center animate-pulse">
                                        ⚠ Wacht op toewijzing operator
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Middle Column: Specs & Comments */}
                              <div className="lg:col-span-4 space-y-4 border-r border-slate-100 pr-0 lg:pr-6">
                                <h5 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 font-sans flex items-center gap-1.5">
                                  📑 Productspecificaties
                                </h5>

                                <div className="space-y-3 text-xs">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-slate-50 p-2.5 rounded-xl">
                                      <span className="text-[10px] uppercase font-bold text-slate-400">Producttype</span>
                                      <p className="font-extrabold text-slate-800">{order.selectedProductName}</p>
                                    </div>
                                    <div className="bg-slate-50 p-2.5 rounded-xl">
                                      <span className="text-[10px] uppercase font-bold text-slate-400">Formaat</span>
                                      <p className="font-mono font-bold text-slate-800">{order.customWidth}x{order.customHeight} mm</p>
                                    </div>
                                  </div>

                                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Preflight Resolutie</span>
                                    <div className="space-y-1.5">
                                      {order.imageSrcUrl && (
                                        <div className="flex items-center justify-between text-slate-600 font-sans">
                                          <span>A-Zijde:</span>
                                          <span className="font-mono font-bold text-slate-800">{order.frontComputedDpi ? `${order.frontComputedDpi} DPI` : 'Geladen (300+ DPI)'}</span>
                                        </div>
                                      )}
                                      {order.backImageSrcUrl && (
                                        <div className="flex items-center justify-between text-slate-600 font-sans">
                                          <span>B-Zijde:</span>
                                          <span className="font-mono font-bold text-slate-800">{order.backComputedDpi ? `${order.backComputedDpi} DPI` : 'Geladen (300+ DPI)'}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-xl">
                                    <span className="text-[10px] uppercase font-bold text-amber-805 block mb-1">Opmerkingen Klant</span>
                                    <p className="text-amber-900 font-medium italic">
                                      {order.clientComments ? `"${order.clientComments}"` : 'Geen specifieke opmerkingen opgegeven.'}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Right Column: Preflight Downloads and Render Canvas */}
                              <div className="lg:col-span-4 space-y-4 font-sans">
                                <h5 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                  <Download className="w-3.5 h-3.5 text-slate-400" /> Print-Ready Bestanden
                                </h5>

                                <div className="space-y-4">
                                  {/* A-Side Card wrapper */}
                                  {order.imageSrcUrl ? (
                                    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2 flex items-center justify-between gap-3 shadow-3xs">
                                      <div className="flex items-center gap-3">
                                        <div className="w-12 h-16 bg-white border border-slate-350 rounded-md overflow-hidden relative flex items-center justify-center shrink-0 shadow-3xs">
                                          <img
                                            src={order.imageSrcUrl}
                                            alt="Voorkant thumb"
                                            className="h-full object-cover"
                                            style={{
                                              transform: `rotate(${order.frontRotationDegrees || 0}deg)`
                                            }}
                                          />
                                        </div>
                                        <div className="min-w-0 max-w-[125px]">
                                          <p className="text-[11px] font-bold text-slate-800 truncate" title={order.frontFileName}>{order.frontFileName}</p>
                                          <p className="text-[9px] text-slate-550 font-mono">Voorkant (A-Zijde)</p>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          const canvas = document.createElement('canvas');
                                          const mmWidth = Number(order.customWidth) || 210;
                                          const mmHeight = Number(order.customHeight) || 297;
                                          const canvasWidth = Math.round(mmWidth * 10);
                                          const canvasHeight = Math.round(mmHeight * 10);
                                          canvas.width = canvasWidth;
                                          canvas.height = canvasHeight;

                                          const ctx = canvas.getContext('2d');
                                          if (ctx) {
                                            ctx.fillStyle = '#ffffff';
                                            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                                            
                                            const img = new Image();
                                            img.onload = () => {
                                              const rot = order.frontRotationDegrees || 0;
                                              const fit = order.frontFitMode || 'fill';
                                              const imgW = img.naturalWidth;
                                              const imgH = img.naturalHeight;
                                              
                                              const is90Rotated = (rot % 180 !== 0);
                                              const drawWidth = is90Rotated ? canvasHeight : canvasWidth;
                                              const drawHeight = is90Rotated ? canvasWidth : canvasHeight;
                                              
                                              let sWidth = drawWidth;
                                              let sHeight = drawHeight;
                                              let sX = 0;
                                              let sY = 0;
                                              
                                              if (fit === 'fill') {
                                                const ratioTarget = drawWidth / drawHeight;
                                                const ratioImage = imgW / imgH;
                                                if (ratioImage > ratioTarget) {
                                                  sHeight = drawHeight;
                                                  sWidth = drawHeight * ratioImage;
                                                  sX = (drawWidth - sWidth) / 2;
                                                } else {
                                                  sWidth = drawWidth;
                                                  sHeight = drawWidth / ratioImage;
                                                  sY = (drawHeight - sHeight) / 2;
                                                }
                                              } else if (fit === 'fit') {
                                                const ratioTarget = drawWidth / drawHeight;
                                                const ratioImage = imgW / imgH;
                                                if (ratioImage > ratioTarget) {
                                                  sWidth = drawWidth;
                                                  sHeight = drawWidth / ratioImage;
                                                  sY = (drawHeight - sHeight) / 2;
                                                } else {
                                                  sHeight = drawHeight;
                                                  sWidth = drawHeight * ratioImage;
                                                  sX = (drawWidth - sWidth) / 2;
                                                }
                                              }
                                              
                                              ctx.save();
                                              ctx.translate(canvasWidth / 2, canvasHeight / 2);
                                              ctx.rotate((rot * Math.PI) / 180);
                                              ctx.drawImage(img, sX - drawWidth/2, sY - drawHeight/2, sWidth, sHeight);
                                              ctx.restore();

                                              const link = document.createElement('a');
                                              const sanitized = order.clientName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'klant';
                                              link.download = `${order.id}_${sanitized}_A_zijde.png`;
                                              link.href = canvas.toDataURL('image/png');
                                              link.click();
                                            };
                                            img.src = order.imageSrcUrl;
                                          }
                                        }}
                                        className="px-3 py-1.5 bg-blue-700 hover:bg-blue-805 text-white font-bold text-[10px] rounded-lg transition-all shadow-3xs flex items-center gap-1 shrink-0 cursor-pointer"
                                      >
                                        <FileDown className="w-3.5 h-3.5" />
                                        Download
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="border border-dashed border-slate-200 rounded-xl p-3 text-center text-[11px] text-slate-400 bg-slate-50/50">
                                       Geen bestand voor A-zijde gevonden
                                    </div>
                                  )}

                                  {/* B-Side Card wrapper */}
                                  {order.printSides === 'double' && (
                                    order.backImageSrcUrl ? (
                                      <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2 flex items-center justify-between gap-3 animate-fade-in">
                                        <div className="flex items-center gap-3">
                                          <div className="w-12 h-16 bg-white border border-slate-350 rounded-md overflow-hidden relative flex items-center justify-center shrink-0 shadow-3xs">
                                            <img
                                              src={order.backImageSrcUrl}
                                              alt="Achterkant thumb"
                                              className="h-full object-cover"
                                              style={{
                                                transform: `rotate(${order.backRotationDegrees || 0}deg)`
                                              }}
                                            />
                                          </div>
                                          <div className="min-w-0 max-w-[125px]">
                                            <p className="text-[11px] font-bold text-slate-800 truncate" title={order.backFileName}>{order.backFileName}</p>
                                            <p className="text-[9px] text-slate-550 font-mono">Achterkant (B-Zijde)</p>
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            const canvas = document.createElement('canvas');
                                            const mmWidth = Number(order.customWidth) || 210;
                                            const mmHeight = Number(order.customHeight) || 297;
                                            const canvasWidth = Math.round(mmWidth * 10);
                                            const canvasHeight = Math.round(mmHeight * 10);
                                            canvas.width = canvasWidth;
                                            canvas.height = canvasHeight;

                                            const ctx = canvas.getContext('2d');
                                            if (ctx) {
                                              ctx.fillStyle = '#ffffff';
                                              ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                                              
                                              const img = new Image();
                                              img.onload = () => {
                                                const rot = order.backRotationDegrees || 0;
                                                const fit = order.backFitMode || 'fill';
                                                const imgW = img.naturalWidth;
                                                const imgH = img.naturalHeight;
                                                
                                                const is90Rotated = (rot % 180 !== 0);
                                                const drawWidth = is90Rotated ? canvasHeight : canvasWidth;
                                                const drawHeight = is90Rotated ? canvasWidth : canvasHeight;
                                                
                                                let sWidth = drawWidth;
                                                let sHeight = drawHeight;
                                                let sX = 0;
                                                let sY = 0;
                                                
                                                if (fit === 'fill') {
                                                  const ratioTarget = drawWidth / drawHeight;
                                                  const ratioImage = imgW / imgH;
                                                  if (ratioImage > ratioTarget) {
                                                    sHeight = drawHeight;
                                                    sWidth = drawHeight * ratioImage;
                                                    sX = (drawWidth - sWidth) / 2;
                                                  } else {
                                                    sWidth = drawWidth;
                                                    sHeight = drawWidth / ratioImage;
                                                    sY = (drawHeight - sHeight) / 2;
                                                  }
                                                } else if (fit === 'fit') {
                                                  const ratioTarget = drawWidth / drawHeight;
                                                  const ratioImage = imgW / imgH;
                                                  if (ratioImage > ratioTarget) {
                                                    sWidth = drawWidth;
                                                    sHeight = drawWidth / ratioImage;
                                                    sY = (drawHeight - sHeight) / 2;
                                                  } else {
                                                    sHeight = drawHeight;
                                                    sWidth = drawHeight * ratioImage;
                                                    sX = (drawWidth - sWidth) / 2;
                                                  }
                                                }
                                                
                                                ctx.save();
                                                ctx.translate(canvasWidth / 2, canvasHeight / 2);
                                                ctx.rotate((rot * Math.PI) / 180);
                                                ctx.drawImage(img, sX - drawWidth/2, sY - drawHeight/2, sWidth, sHeight);
                                                ctx.restore();

                                                const link = document.createElement('a');
                                                const sanitized = order.clientName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'klant';
                                                link.download = `${order.id}_${sanitized}_B_zijde.png`;
                                                link.href = canvas.toDataURL('image/png');
                                                link.click();
                                              };
                                              img.src = order.backImageSrcUrl;
                                            }
                                          }}
                                          className="px-3 py-1.5 bg-blue-700 hover:bg-blue-805 text-white font-bold text-[10px] rounded-lg transition-all shadow-3xs flex items-center gap-1 shrink-0 cursor-pointer"
                                        >
                                          <FileDown className="w-3.5 h-3.5" />
                                          Download
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="border border-dashed border-slate-200 rounded-xl p-3 text-center text-[11px] text-slate-400 bg-slate-50/50">
                                         Klant heeft dubbelzijdig geselecteerd maar geen B-zijde geüpload
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>

                            </div>

                            {/* Admin Status Update Row */}
                            <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                {/* Real QR Code of the tracking URL */}
                                <div className="shrink-0 bg-white border border-slate-200 p-1.5 rounded-lg shadow-4xs select-none">
                                  <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(window.location.origin + "/?orderId=" + order.id)}`}
                                    alt="Status QR"
                                    className="w-12 h-12 object-contain"
                                  />
                                </div>
                                <div className="space-y-0.5 text-left text-xs">
                                  <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">LIVE STATUS TRACKING</span>
                                  <div className="flex items-center gap-2">
                                    <a 
                                      href={`/?orderId=${order.id}`} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="text-xs font-black text-blue-750 hover:underline flex items-center gap-1 font-sans"
                                    >
                                      Klant statuspagina openen <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                  <p className="text-[10px] text-slate-455 leading-none">Scannen of delen met de klant.</p>
                                </div>
                              </div>

                              {/* Status controls */}
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 font-sans">
                                <div className="space-y-0.5 min-w-[120px] text-left">
                                  <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">Nieuwe Status</span>
                                  <select
                                    value={adminStatusInputs[order.id]?.status || order.status || 'Ingediend'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setAdminStatusInputs(prev => ({
                                        ...prev,
                                        [order.id]: {
                                          ...(prev[order.id] || { note: '' }),
                                          status: val
                                        }
                                      }));
                                    }}
                                    className="w-full bg-white border border-slate-205 text-xs font-bold text-slate-800 px-2.5 py-1.5 rounded-lg focus:outline-hidden focus:border-blue-500 font-sans"
                                  >
                                    <option value="Ingediend">Ingediend</option>
                                    <option value="In Controle">In Controle</option>
                                    <option value="Preflight Goedgekeurd">Preflight Goedgekeurd</option>
                                    <option value="Actie Vereist">Actie Vereist (Rejectie)</option>
                                    <option value="In Druk">In Druk</option>
                                    <option value="Klaar voor Afhalen">Klaar voor Afhalen</option>
                                    <option value="Verzonden">Verzonden / Bezorgd</option>
                                  </select>
                                </div>

                                <div className="space-y-0.5 flex-1 min-w-[200px] text-left">
                                  <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">Notitie voor de klant</span>
                                  <input
                                    type="text"
                                    placeholder={
                                      (adminStatusInputs[order.id]?.status || order.status) === 'Actie Vereist'
                                        ? 'Bijv. Bestand heeft te lage resolutie (DPI)'
                                        : 'Bijv. Uw order is gecontroleerd en goedgekeurd.'
                                    }
                                    value={adminStatusInputs[order.id]?.note ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setAdminStatusInputs(prev => ({
                                        ...prev,
                                        [order.id]: {
                                          ...(prev[order.id] || { status: order.status || 'Ingediend' }),
                                          note: val
                                        }
                                      }));
                                    }}
                                    className="w-full bg-white border border-slate-205 text-xs font-medium text-slate-800 px-3 py-1.5 rounded-lg focus:outline-hidden focus:border-blue-500"
                                  />
                                </div>

                                <button
                                  type="button"
                                  disabled={isUpdatingStatus[order.id]}
                                  onClick={async () => {
                                    const inp = adminStatusInputs[order.id] || { status: order.status || 'Ingediend', note: '' };
                                    if (!inp.note) {
                                      alert('Gelieve een korte notitie in te voeren voor de bestelling historieverloop.');
                                      return;
                                    }

                                    setIsUpdatingStatus(prev => ({ ...prev, [order.id]: true }));
                                    try {
                                      const res = await fetch(`/api/orders/${order.id}`, {
                                        method: 'PUT',
                                        headers: {
                                          'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({
                                          status: inp.status,
                                          note: inp.note
                                        })
                                      });

                                      if (res.ok) {
                                        // Update local state orders list
                                        const updatedOrder = await res.json();
                                        setOrders(prev => prev.map(item => item.id === order.id ? updatedOrder : item));
                                        
                                        // Clear input note
                                        setAdminStatusInputs(prev => ({
                                          ...prev,
                                          [order.id]: {
                                            ...prev[order.id],
                                            note: ''
                                          }
                                        }));
                                        alert('Bestelling status succesvol bijgewerkt!');
                                      } else {
                                        alert('Fout bij het bijwerken van de status.');
                                      }
                                    } catch (err) {
                                      console.error(err);
                                      alert('Fout bij verbinding met de preflight database.');
                                    } finally {
                                      setIsUpdatingStatus(prev => ({ ...prev, [order.id]: false }));
                                    }
                                  }}
                                  className="self-end py-1.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-extrabold text-xs rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 h-[33px] focus:outline-hidden"
                                >
                                  {isUpdatingStatus[order.id] ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <span>Bijwerken</span>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
            ) : adminSubTab === 'staff' ? (
                /* STAFF LIST WORKSPACE VIEW */
                <div className="space-y-6 animate-fade-in font-sans">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-3xs text-left">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 border-none">
                          Personeelsbeheer &amp; Operators
                        </h3>
                        <p className="text-xs text-slate-505 mt-1 max-w-xl">
                          Voeg medewerkers toe zodat orders aan hen kunnen worden toegewezen voor werkstroombeheer.
                        </p>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded border">
                        Actieve teamleden: {staffList.length}
                      </span>
                    </div>

                    {/* Add team member inline card */}
                    <form
                      onSubmit={handleAddStaff}
                      className="bg-slate-50 border border-slate-150 p-4 rounded-xl flex flex-col md:flex-row items-end gap-3"
                    >
                      <div className="flex-1 w-full space-y-1 text-left">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Naam medewerker</label>
                        <input
                          type="text"
                          required
                          placeholder="Bijv. Mark de Vries"
                          value={staffNameInput}
                          onChange={(e) => setStaffNameInput(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-hidden focus:border-blue-500 bg-white text-slate-800"
                        />
                      </div>
                      
                      <div className="w-full md:w-64 space-y-1 text-left">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Functie / Rol</label>
                        <select
                          value={staffRoleInput}
                          onChange={(e) => setStaffRoleInput(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-hidden bg-white text-slate-800"
                        >
                          <option value="Pre-press Operator">Pre-press Operator</option>
                          <option value="DTP Specialist">DTP Specialist</option>
                          <option value="Productie Medewerker">Productie Medewerker</option>
                          <option value="Backoffice Beheerder">Backoffice Beheerder</option>
                        </select>
                      </div>

                      <button
                        type="submit"
                        className="w-full md:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-850 text-white text-xs font-extrabold rounded-lg shadow-4xs transition-all cursor-pointer shrink-0"
                      >
                        Medewerker Toevoegen
                      </button>
                    </form>

                    {staffError && (
                      <p className="text-xs text-rose-600 font-semibold mt-2 text-left">{staffError}</p>
                    )}

                    {/* Staff team table list */}
                    <div className="mt-8 border border-slate-200/60 rounded-xl overflow-hidden shadow-4xs bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-[10px] uppercase font-extrabold tracking-wider text-slate-400 border-b border-slate-200">
                            <th className="py-3 px-4">Operator Naam</th>
                            <th className="py-3 px-4">Functie</th>
                            <th className="py-3 px-4">Actieve Taken / Orders</th>
                            <th className="py-3 px-4 text-center">Actie</th>
                          </tr>
                        </thead>
                        <tbody>
                          {staffList.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-xs text-slate-400 font-sans italic">
                                Geen medewerkers geconfigureerd. Voeg hierboven uw eerste teamlid toe.
                              </td>
                            </tr>
                          ) : (
                            staffList.map((st) => {
                              // Count assigned orders
                              const activeJobs = orders.filter(o => o.assignedStaff === st.name);

                              return (
                                <tr key={st.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-xs transition-colors">
                                  <td className="py-3 px-4 font-extrabold text-slate-800 flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-black uppercase text-[10px]">
                                      {st.name.charAt(0)}
                                    </div>
                                    {st.name}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-105 text-slate-700 max-w-fit border">
                                      {st.role}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4">
                                    {activeJobs.length > 0 ? (
                                      <div className="space-y-1">
                                        <span className="px-1.5 py-0.5 rounded-full font-mono text-[10px] font-black bg-blue-50 text-blue-800 border border-blue-100">
                                          {activeJobs.length} openstaande job{activeJobs.length > 1 ? 's' : ''}
                                        </span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {activeJobs.map(job => (
                                            <span key={job.id} className="text-[9px] font-mono font-bold bg-slate-100 px-1 py-px rounded border border-slate-205">
                                              #{job.id}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] font-medium text-slate-400 italic">
                                        Momenteel geen taken
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteStaff(st.id)}
                                      className="p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-red-655 rounded-lg transition-colors cursor-pointer"
                                      title="Operator Verwijderen"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
            ) : (
                /* CREATE MANUAL ORDER WORKSPACE VIEW */
                <div className="space-y-6 animate-fade-in font-sans">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-3xs text-left">
                    <div className="mb-6">
                      <h3 className="text-base font-extrabold text-slate-905 border-none">
                        Nieuwe Handmatige Opdracht Aanmaken
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                        Maak direct een opdracht aan voor een klant. Nadat de opdracht is aangemaakt, genereert het systeem een Unieke QR-code en live status tracking link. De klant kan hiermee zelf bestanden aanleveren en live voortgang volgen.
                      </p>
                    </div>

                    {manualCreatedOrder ? (
                      /* SUCCESS VIEW FOR MANUAL ORDER CREATED */
                      <div className="bg-emerald-50 border-2 border-emerald-500 rounded-3xl p-6 space-y-6 animate-fade-in">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-lg">
                            ✓
                          </div>
                          <div>
                            <h4 className="font-extrabold text-sm sm:text-base text-emerald-950">
                              Order #{manualCreatedOrder.id} Succesvol Aangemaakt!
                            </h4>
                            <p className="text-xs text-emerald-800">
                              De QR-code en tracking link staan hieronder gereed voor de klant.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm">
                          <div className="space-y-4 text-left">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">LIVE QR CODE VOOR DE KLANT</span>
                            <div className="w-36 h-36 border border-slate-205 p-2 rounded-xl bg-white shadow-4xs mx-auto md:mx-0">
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(window.location.origin + "/?orderId=" + manualCreatedOrder.id)}`}
                                alt="Order QR Code"
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                              Laat de klant deze QR-code scannen met hun smartphone of print deze op de bon. Zij kunnen direct op hun telefoon de bestanden uploaden en de pre-press status inzien.
                            </p>
                          </div>

                          <div className="space-y-3.5 text-left text-xs text-slate-705 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6 leading-relaxed">
                            <div>
                              <span className="text-[9px] uppercase font-mono font-bold text-slate-400">KLANT</span>
                              <p className="font-bold text-slate-900">{manualCreatedOrder.clientName}</p>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase font-mono font-bold text-slate-400">PRODUCTTYPE</span>
                              <p className="font-bold text-slate-905">{manualCreatedOrder.selectedProductName || 'Op Maat Product'}</p>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase font-mono font-bold text-slate-400">FORMAT</span>
                              <p className="font-mono font-bold text-slate-905">{manualCreatedOrder.customWidth}x{manualCreatedOrder.customHeight} mm</p>
                            </div>
                            <div className="pt-2 border-t border-slate-100">
                              <span className="text-[9px] uppercase font-mono font-bold text-slate-400">LIVE TRACKING LINK (DEEL MET DE KLANT)</span>
                              <div className="flex items-center gap-1.5 mt-1 col-span-2">
                                <input
                                  type="text"
                                  readOnly
                                  value={`${window.location.origin}/?orderId=${manualCreatedOrder.id}`}
                                  className="w-full bg-slate-50 text-[11px] font-mono font-bold border rounded p-1.5 focus:outline-hidden"
                                  onClick={(e) => (e.target as HTMLInputElement).select()}
                                />
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/?orderId=${manualCreatedOrder.id}`);
                                    alert("Gekopieerd naar klembord!");
                                  }}
                                  className="px-3 py-1.5 bg-slate-900 text-white font-extrabold text-[10px] rounded hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                                >
                                  Kopieer
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => {
                              setManualCreatedOrder(null);
                            }}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-4xs transition-all cursor-pointer"
                          >
                            Nog een handmatige opdracht aanmaken
                          </button>
                          <button
                            onClick={() => {
                              setAdminSubTab('orders');
                              fetchAdminOrders();
                            }}
                            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-805 text-white font-extrabold text-xs rounded-xl shadow-4xs transition-all cursor-pointer"
                          >
                            Bekijk in orders overzicht
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* CREATE FORM */
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          
                          const manualOrderPayload = {
                            clientName: adminOrderClientName,
                            clientEmail: adminOrderClientEmail,
                            clientPhone: adminOrderClientPhone || '-',
                            clientReference: adminOrderClientReference || '',
                            clientQuantity: Number(adminOrderClientQuantity) || 100,
                            selectedProductName: adminOrderSelectedProduct.name || 'Op Maat Product',
                            selectedProductCategory: adminOrderSelectedProduct.category || 'Custom',
                            customWidth: Number(adminOrderCustomWidth) || 210,
                            customHeight: Number(adminOrderCustomHeight) || 297,
                            printSides: adminOrderPrintSides,
                            clientComments: adminOrderComments,
                            status: 'Ingediend',
                            assignedStaff: adminOrderAssignedStaff
                          };

                          try {
                            const res = await fetch('/api/orders', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json'
                              },
                              body: JSON.stringify({ orderData: manualOrderPayload })
                            });

                            if (res.ok) {
                              const result = await res.json();
                              setManualCreatedOrder({ id: result.orderId, ...manualOrderPayload });
                              
                              // Reset creation inputs
                              setAdminOrderClientName("");
                              setAdminOrderClientEmail("");
                              setAdminOrderClientPhone("");
                              setAdminOrderClientReference("");
                              setAdminOrderClientQuantity(100);
                              setAdminOrderComments("");
                              setAdminOrderAssignedStaff("");
                              
                              fetchAdminOrders(); // Refresh orders pool in background
                            } else {
                              alert('Fout bij het handmatig opslaan van de opdracht.');
                            }
                          } catch (err) {
                            console.error(err);
                            alert('Fout bij verbinding met de preflight database.');
                          }
                        }}
                        className="space-y-6 font-sans text-xs"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Card 1: Klantgegevens */}
                          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-150 space-y-4">
                            <h4 className="font-extrabold text-slate-850 text-sm border-none flex items-center gap-1.5">
                              <User className="w-4 h-4 text-slate-500" /> 1. Klant &amp; Contactgegevens
                            </h4>

                            <div className="space-y-3">
                              <div className="space-y-1 block text-left">
                                <label className="text-[10px] uppercase font-bold text-slate-500">Klant- of Bedrijfsnaam</label>
                                <input
                                  type="text"
                                  required
                                  placeholder="Bijv. Janssen Marketing BV"
                                  value={adminOrderClientName}
                                  onChange={(e) => setAdminOrderClientName(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-hidden text-slate-800 bg-white"
                                />
                              </div>

                              <div className="space-y-1 block text-left">
                                <label className="text-[10px] uppercase font-bold text-slate-500">E-mailadres Klant</label>
                                <input
                                  type="email"
                                  required
                                  placeholder="Bijv. info@janssen.nl"
                                  value={adminOrderClientEmail}
                                  onChange={(e) => setAdminOrderClientEmail(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-hidden text-slate-800 bg-white"
                                />
                              </div>

                              <div className="space-y-1 block text-left">
                                <label className="text-[10px] uppercase font-bold text-slate-500">Telefoonnummer (Optioneel)</label>
                                <input
                                  type="text"
                                  placeholder="Bijv. +31 6 12345678"
                                  value={adminOrderClientPhone}
                                  onChange={(e) => setAdminOrderClientPhone(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-hidden text-slate-805 bg-white"
                                />
                              </div>

                              <div className="space-y-1 block text-left">
                                <label className="text-[10px] uppercase font-bold text-slate-500">Referentiekode (Optioneel)</label>
                                <input
                                  type="text"
                                  placeholder="Bijv. REF-2026-A"
                                  value={adminOrderClientReference}
                                  onChange={(e) => setAdminOrderClientReference(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono focus:outline-hidden text-slate-805 bg-white"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Card 2: Productdetails */}
                          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-150 space-y-4">
                            <h4 className="font-extrabold text-slate-850 text-sm border-none flex items-center gap-1.5">
                              <Briefcase className="w-4 h-4 text-slate-500" /> 2. Drukwerk Formaat &amp; Specificaties
                            </h4>

                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1 block text-left">
                                  <label className="text-[10px] uppercase font-bold text-slate-500">Preset Product</label>
                                  <select
                                    value={adminOrderSelectedProduct.name}
                                    onChange={(e) => {
                                      const prodName = e.target.value;
                                      const match = STANDARD_PRODUCTS.find(p => p.name === prodName) || STANDARD_PRODUCTS[0];
                                      setAdminOrderSelectedProduct(match);
                                      setAdminOrderCustomWidth(match.widthMm);
                                      setAdminOrderCustomHeight(match.heightMm);
                                      if (match.category === 'Sticker') {
                                        setAdminOrderPrintSides('single');
                                      }
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-hidden text-slate-805 bg-white"
                                  >
                                    {STANDARD_PRODUCTS.map(p => (
                                      <option key={p.name} value={p.name}>{p.name}</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="space-y-1 block text-left">
                                  <label className="text-[10px] uppercase font-bold text-slate-500">Product Naam</label>
                                  <input
                                    type="text"
                                    required
                                    value={adminOrderSelectedProduct.name}
                                    readOnly
                                    className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-hidden text-slate-500 cursor-not-allowed"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1 block text-left">
                                  <label className="text-[10px] uppercase font-bold text-slate-500">Breedte (mm)</label>
                                  <input
                                    type="number"
                                    required
                                    value={adminOrderCustomWidth}
                                    onChange={(e) => setAdminOrderCustomWidth(Number(e.target.value))}
                                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono font-bold focus:outline-hidden text-slate-805 bg-white"
                                  />
                                </div>

                                <div className="space-y-1 block text-left">
                                  <label className="text-[10px] uppercase font-bold text-slate-500">Hoogte (mm)</label>
                                  <input
                                    type="number"
                                    required
                                    value={adminOrderCustomHeight}
                                    onChange={(e) => setAdminOrderCustomHeight(Number(e.target.value))}
                                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono font-bold focus:outline-hidden text-slate-805 bg-white"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1 block text-left">
                                  <label className="text-[10px] uppercase font-bold text-slate-500">Zijdigheid</label>
                                  <select
                                    disabled={adminOrderSelectedProduct.category === 'Sticker'}
                                    value={adminOrderPrintSides}
                                    onChange={(e) => setAdminOrderPrintSides(e.target.value as 'single' | 'double')}
                                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-hidden text-slate-805 bg-white"
                                  >
                                    <option value="single">Enkelzijdig</option>
                                    <option value="double">Dubbelzijdig</option>
                                  </select>
                                </div>

                                <div className="space-y-1 block text-left">
                                  <label className="text-[10px] uppercase font-bold text-slate-500">Aantal stuks (Oplage)</label>
                                  <input
                                    type="number"
                                    required
                                    value={adminOrderClientQuantity}
                                    onChange={(e) => setAdminOrderClientQuantity(Number(e.target.value))}
                                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold focus:outline-hidden text-slate-800 bg-white"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1 block text-left">
                                <label className="text-[10px] uppercase font-bold text-slate-500">Assigneer Operator direct (Optioneel)</label>
                                <select
                                  value={adminOrderAssignedStaff}
                                  onChange={(e) => setAdminOrderAssignedStaff(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold focus:outline-hidden text-slate-805 bg-white"
                                >
                                  <option value="">-- Geen operator toegewezen --</option>
                                  {staffList.map((m) => (
                                    <option key={m.id} value={m.name}>
                                      {m.name} ({m.role})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-1 block text-left">
                                <label className="text-[10px] uppercase font-bold text-slate-500">Interne Opmerkingen</label>
                                <textarea
                                  value={adminOrderComments}
                                  onChange={(e) => setAdminOrderComments(e.target.value)}
                                  placeholder="Bijvoorbeeld: Sneldruk gewenst."
                                  rows={2}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs focus:outline-hidden text-slate-800 bg-white"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <button
                            type="submit"
                            className="px-6 py-3 bg-slate-900 border-none hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-4xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <PlusCircle className="w-4 h-4 text-emerald-400" /> Opdracht Aanmaken &amp; Activeer QR-code
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
            )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Info Tips panel bottom bar */}
      <section className="bg-white border-t border-slate-200 mt-16 py-12 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-2">
            <h5 className="font-bold text-slate-800 font-sans text-sm flex items-center gap-1.5 label">
              <Scale className="w-4 h-4 text-blue-600" />
              Aspect Ratio Matters
            </h5>
            <p className="text-slate-500 leading-normal">
              An aspect ratio mismatch forces margins or cropping. Choose standard products (A4, A3, Flyers) or input custom sizes to align artwork boundary perfectly.
            </p>
          </div>

          <div className="space-y-2">
            <h5 className="font-bold text-slate-800 font-sans text-sm flex items-center gap-1.5 label">
              <Layers className="w-4 h-4 text-blue-600" />
              What is a Bleed Guard?
            </h5>
            <p className="text-slate-500 leading-normal">
              Bleed is an extra 3mm border surrounding design documents. It prevents white slice gaps when mechanical knives cut your papers in industrial print centers.
            </p>
          </div>

          <div className="space-y-2">
            <h5 className="font-bold text-slate-800 font-sans text-sm flex items-center gap-1.5 label">
              <Printer className="w-4 h-4 text-blue-600" />
              RGB vs CMYK Profiles
            </h5>
            <p className="text-slate-500 leading-normal">
              Monitors show screens in RGB, but physical ink uses CMYK. Pre-Press Pro handles automatic conversions transparently to retain rich design color balances.
            </p>
          </div>
        </div>
      </section>

      {/* Order successful submission Modal & Client form Modal */}
      <AnimatePresence>
        {isClientFormOpen && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl relative border border-slate-100 font-sans"
            >
              <button
                type="button"
                onClick={() => setIsClientFormOpen(false)}
                className="absolute right-4 top-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer animate-fade-in"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-4 pt-1 text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center border border-blue-100 shrink-0">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">
                      Klantgegevens & Drukopdracht
                    </h3>
                    <p className="text-xs text-slate-500">
                      Vul uw contactgegevens in om deze preflight-gecontroleerde drukopdracht in te sturen naar het beheerdersportaal.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleOrderSubmit} className="space-y-4">
                  {submissionError && (
                    <div className="bg-rose-50 border border-rose-150 rounded-xl p-3 text-xs font-bold text-rose-700">
                      {submissionError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block">Naam / Bedrijfsnaam <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-450 absolute left-3 top-3.5" />
                        <input
                          type="text"
                          required
                          placeholder="Bijv. Jansen Media B.V."
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block">E-mailadres <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-450 absolute left-3 top-3.5" />
                        <input
                          type="email"
                          required
                          placeholder="Bijv. info@bedrijf.nl"
                          value={clientEmail}
                          onChange={(e) => setClientEmail(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block">Telefoonnummer <span className="text-rose-500">*</span></label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-455 absolute left-3 top-3.5" />
                        <input
                          type="tel"
                          required
                          placeholder="Bijv. +31 6 12345678"
                          value={clientPhone}
                          onChange={(e) => setClientPhone(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block">Referentie of Offertenummer</label>
                      <input
                        type="text"
                        placeholder="Bijv. REF-2026-9482"
                        value={clientReference}
                        onChange={(e) => setClientReference(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block">Gewenste Oplage (Stuks)</label>
                      <input
                        type="number"
                        min={1}
                        placeholder="100"
                        value={clientQuantity}
                        onChange={(e) => setClientQuantity(Number(e.target.value) || 1)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white font-mono font-bold text-slate-800"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block">Geselecteerd Formaat</label>
                      <div className="px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl font-mono text-slate-700 text-xs font-bold leading-normal">
                        {customWidth} × {customHeight} mm ({printSides === 'double' ? 'Dubbelzijdig' : 'Enkelzijdig'})
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <label className="font-bold text-slate-700 block">Opmerkingen voor de Drukker</label>
                    <textarea
                      placeholder="Typ hier eventuele instructies voor papierafwerking, vouwlijnen of nabewerking..."
                      value={clientComments}
                      onChange={(e) => setClientComments(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white h-20 text-slate-800"
                    />
                  </div>

                  <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                     Door te versturen stemt u ermee in dat uw bestanden worden opgeslagen voor download binnen de beveiligde backoffice van FD Printing.
                  </p>

                  <div className="flex gap-3 pt-2 font-sans">
                    <button
                      type="button"
                      onClick={() => setIsClientFormOpen(false)}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
                    >
                      Annuleren
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingOrder}
                      className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-805 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:bg-blue-300"
                    >
                      {isSubmittingOrder ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Bestanden insturen...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Afronden & Insturen</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}

        {showOrderSuccessModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-left">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-100 text-center"
            >
              <button
                onClick={() => setShowOrderSuccessModal(false)}
                className="absolute right-4 top-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center space-y-4 pt-2">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                  <CheckCircle className="w-9 h-9 stroke-[2.5]" />
                </div>

                <div className="space-y-1">
                  <h3 className="font-extrabold text-slate-900 text-lg sm:text-xl font-sans">
                     Succesvol Ingediend!
                  </h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                     Uw preflight-gevalideerde bestelling is overgedragen naar de beheerder backoffice onder unieke code:
                  </p>
                  <p className="font-black text-blue-700 text-lg tracking-wider font-mono">
                    {submittedOrderId}
                  </p>
                </div>

                <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/50 text-left space-y-2 text-xs text-slate-700 max-w-xs mx-auto">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Naam:</span>
                    <span className="font-bold text-slate-800">{clientName || 'Gast'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Producttype:</span>
                    <span className="font-bold text-slate-800">{selectedProduct.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Gewenst Formaat:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {customWidth} × {customHeight} mm
                    </span>
                  </div>
                </div>

                {/* Status QR Code */}
                {submittedOrderId && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/55 max-w-xs mx-auto space-y-3.5">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">SCAN OM OP TELEFOON TE VOLGEN</span>
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(window.location.origin + "/?orderId=" + submittedOrderId)}`}
                      alt="Order Tracking QR"
                      className="w-32 h-32 mx-auto rounded-lg shadow-sm bg-white p-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setTrackedOrderId(submittedOrderId);
                        fetchTrackedOrder(submittedOrderId);
                        setShowOrderSuccessModal(false);
                      }}
                      className="text-[11px] text-blue-700 hover:underline font-extrabold block w-full text-center"
                    >
                      Of open de statuspagina hier &rarr;
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-1.5 justify-center py-1.5 text-[11px] font-semibold text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  <span>Ontvangen door FD Printing Center Amsterdam</span>
                </div>

                <div className="flex items-center gap-2 max-w-xs mx-auto">
                  <button
                    onClick={() => {
                      if (submittedOrderId) {
                        setTrackedOrderId(submittedOrderId);
                        fetchTrackedOrder(submittedOrderId);
                      }
                      setShowOrderSuccessModal(false);
                    }}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer font-sans"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Volg Status</span>
                  </button>
                  <button
                    onClick={() => setShowOrderSuccessModal(false)}
                    className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer font-sans"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Sluiten</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {previewFile && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50 font-sans" onClick={() => setPreviewFile(null)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-100 flex flex-col md:flex-row relative"
              onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button absolute */}
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="absolute right-4 top-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer z-20"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Left Column: Visual pre-press layout annotations safety overlay */}
                <div className="md:w-1/2 bg-slate-100 p-8 flex flex-col items-center justify-center relative min-h-[350px] md:min-h-[480px] select-none border-r border-slate-150">
                  <div className="absolute top-4 left-4 bg-slate-900/10 text-slate-650 font-mono text-[9px] px-2 py-1 rounded border border-slate-205">
                    PREFLIGHT SIMULATION DESK
                  </div>

                  {pdfLayoutMode === 'sra3' ? (
                    /* SRA3 Live Imposition Grid Preview */
                    <div className="flex flex-col items-center gap-4 w-full">
                      {/* SRA3 Live Sheet Map */}
                      <div 
                        className="relative bg-white border-2 border-slate-350 shadow-md rounded-sm overflow-hidden p-0.5"
                        style={{
                          width: '100%',
                          maxWidth: sheetW > sheetH ? '310px' : '230px',
                          aspectRatio: `${sheetW}/${sheetH}`
                        }}
                      >
                        {/* Printable Area boundary margin inside SRA3 sheet margin of 3mm */}
                        <div 
                          className="absolute border border-dotted border-blue-400/40 pointer-events-none"
                          style={{
                            left: `${(sheetMargin / sheetW) * 100}%`,
                            top: `${(sheetMargin / sheetH) * 100}%`,
                            right: `${(sheetMargin / sheetW) * 100}%`,
                            bottom: `${(sheetMargin / sheetH) * 100}%`
                          }}
                        ></div>

                        {/* Placed Cards rendering loop */}
                        {Array.from({ length: finalRows }).map((_, rIdx) => {
                          return Array.from({ length: finalCols }).map((_, cIdx) => {
                            const itemLeft = startX_percent + cIdx * ((activeW + pdfGutterMm) / sheetW * 100);
                            const itemTop = startY_percent + rIdx * ((activeH + pdfGutterMm) / sheetH * 100);
                            const itemWidth = (activeW / sheetW) * 100;
                            const itemHeight = (activeH / sheetH) * 100;

                            return (
                              <div
                                key={`${rIdx}-${cIdx}`}
                                style={{
                                  position: 'absolute',
                                  left: `${itemLeft}%`,
                                  top: `${itemTop}%`,
                                  width: `${itemWidth}%`,
                                  height: `${itemHeight}%`,
                                  boxSizing: 'border-box'
                                }}
                                className="bg-white border border-slate-250 shadow-4xs overflow-visible flex items-center justify-center animate-fade-in"
                              >
                                <img
                                  src={previewFile.imageSrcUrl}
                                  className="bg-white"
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    transform: `rotate(${(previewFile.rotation || 0) + (finalRotated ? 90 : 0)}deg)`,
                                    objectFit: previewFile.fitMode === 'fit' ? 'contain' : 'cover'
                                  }}
                                  alt=""
                                />
                                 
                                {/* Subtle 2mm white bleed margin highlight limit surrounding each image */}
                                <div className="absolute inset-0 border border-white/60 pointer-events-none"></div>

                                {/* Real-time Hairline Crop Marks (Cutting guide line markers) showing the 2mm gutters */}
                                {/* Top-Left side crop ticks */}
                                <div className="absolute -top-[4px] -left-[0.5px] w-[0.5px] h-1 bg-rose-500/80 pointer-events-none"></div>
                                <div className="absolute -top-[0.5px] -left-[4px] w-1 h-[0.5px] bg-rose-500/80 pointer-events-none"></div>
                                {/* Top-Right side crop ticks */}
                                <div className="absolute -top-[4px] -right-[0.5px] w-[0.5px] h-1 bg-rose-500/80 pointer-events-none"></div>
                                <div className="absolute -top-[0.5px] -right-[4px] w-1 h-[0.5px] bg-rose-500/80 pointer-events-none"></div>
                                {/* Bottom-Left side crop ticks */}
                                <div className="absolute -bottom-[4px] -left-[0.5px] w-[0.5px] h-1 bg-rose-500/80 pointer-events-none"></div>
                                <div className="absolute -bottom-[0.5px] -left-[4px] w-1 h-[0.5px] bg-rose-500/80 pointer-events-none"></div>
                                {/* Bottom-Right side crop ticks */}
                                <div className="absolute -bottom-[4px] -right-[0.5px] w-[0.5px] h-1 bg-rose-500/80 pointer-events-none"></div>
                                <div className="absolute -bottom-[0.5px] -right-[4px] w-1 h-[0.5px] bg-rose-500/80 pointer-events-none"></div>

                                {/* Inner Crop-Trim Guidelines indicator inside each card on SRA3 */}
                                <div className="absolute inset-[1.5px] border border-dashed border-rose-500/30 pointer-events-none"></div>
                              </div>
                            );
                          });
                        })}
                      </div>

                      {/* Pre-press Imposition Specs metadata visual legend */}
                      <div className="w-full space-y-1.5 mt-1 bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-slate-150 shadow-4xs text-[10px] text-left">
                        <div className="font-extrabold text-slate-700 flex items-center gap-1">
                          <Grid className="w-3.5 h-3.5 text-blue-600" />
                          <span>SRA3 Pre-Press Indeling Info</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-500 font-semibold">
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                            <span>Snijlijnen actief</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-slate-700">Tussenruimte:</span>
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 py-0.5 rounded text-[9px]">{pdfGutterMm} mm</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-slate-700">Formaat:</span>
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 py-0.5 rounded text-[9px]">{activeW}x{activeH} mm</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-slate-700">Rendement:</span>
                            <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded text-[9px]">{finalYield} vel</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Single Mode Framing guide mockup */
                    <>
                      <div className="w-full max-w-[280px] aspect-[1/1.41] bg-white border border-slate-350 shadow-md rounded-md relative overflow-hidden transition-all duration-300">
                        <img
                          src={previewFile.imageSrcUrl}
                          alt={previewFile.fileName}
                          className="w-full h-full"
                          style={{
                            transform: `rotate(${previewFile.rotation || 0}deg)`,
                            objectFit: previewFile.fitMode === 'fit' ? 'contain' : 'cover'
                          }}
                        />
                        
                        {/* Outer Dashed Magenta border (3mm Bleed margin limit indicator) */}
                        <div className="absolute inset-[4px] border border-dashed border-rose-500/60 pointer-events-none rounded-[1px]" title="Bleed Limit Boundary (+3mm)"></div>
                        
                        {/* Inside cyan border (Safe action boundary -3mm inside final dimensions) */}
                        <div className="absolute inset-[14px] border border-dashed border-cyan-500/50 pointer-events-none rounded-[1px]" title="Safety Trim Margin (3mm inside)"></div>
                      </div>

                      {/* Guidelines Legends */}
                      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-[9px] text-slate-400 font-bold bg-white/80 backdrop-blur-xs p-2 rounded-lg border border-slate-150 shadow-4xs">
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-0.5 bg-rose-500 inline-block rounded-full"></span>
                          <span>3mm Afloop (Bleed Limit)</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-0.5 bg-cyan-400 inline-block rounded-full"></span>
                          <span>3mm Veiligheidsmarge</span>
                        </span>
                      </div>
                    </>
                  )}
                </div>

              {/* Right Column: Pre-press Specs & Customer Context sheet */}
              <div className="md:w-1/2 p-8 flex flex-col justify-between space-y-6 bg-white min-h-[450px]">
                <div className="space-y-4 pt-1 text-left">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-amber-500" />
                    <span className="text-[10px] uppercase font-black tracking-widest text-[#0a1829] font-mono">Drukwerk Inspectie</span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-xl font-extrabold text-slate-900 leading-tight truncate max-w-[340px]" title={previewFile.fileName}>
                      {previewFile.fileName}
                    </h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1 font-semibold">
                      <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 text-[9px] font-mono leading-none rounded border border-slate-205">Order ID: {previewFile.id}</span>
                      <span>&bull;</span>
                      <span className="text-[#0e5cbf] font-extrabold font-mono text-[11px] leading-none">{previewFile.side}</span>
                    </p>
                  </div>

                  {/* Preflight checks scorecard summary */}
                  <div className="space-y-3.5 pt-2">
                    <div className="grid grid-cols-2 gap-3 font-sans">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/50">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5 font-mono">Formaat</span>
                        <p className="text-xs font-black text-slate-800 font-mono">{previewFile.order.customWidth} &times; {previewFile.order.customHeight} mm</p>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/50">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5 font-mono">Gewenst Product</span>
                        <p className="text-xs font-black text-slate-805 capitalize truncate">{previewFile.order.selectedProductCategory === 'Visitekaart' ? 'Visitekaarten' : previewFile.order.selectedProductCategory}</p>
                      </div>
                    </div>

                    {/* Preflight DPI Quality report */}
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-150 flex items-center justify-between gap-3 font-sans">
                      <div className="space-y-1.5">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block font-mono">DPI preflight controle</span>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle className={`w-4 h-4 ${previewFile.dpi >= 300 ? 'text-emerald-500' : 'text-amber-500 animate-pulse'}`} />
                          <span className="text-xs font-extrabold text-slate-850 font-mono">{previewFile.dpi} DPI</span>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-[10px] font-black border uppercase tracking-wider ${
                        previewFile.dpi >= 300
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-150'
                          : 'bg-rose-50 text-rose-800 border-rose-150 font-black'
                      }`}>
                        {previewFile.dpi >= 300 ? 'Gecertificeerd' : 'Kwaliteitsverlies'}
                      </span>
                    </div>

                    {/* PDF EXPERT EXPORTPANEL */}
                    <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 space-y-3.5 mt-2 font-sans relative overflow-hidden text-left">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none"></div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Printer className="w-4 h-4 text-blue-400" />
                          <span className="text-[10px] uppercase font-black tracking-widest text-slate-100 font-mono">PDF Drukbestand Configurator</span>
                        </div>
                        <span className="bg-blue-900/60 text-blue-300 border border-blue-800 text-[8px] px-1.5 py-0.5 rounded font-black tracking-wider uppercase font-mono">Pre-Press</span>
                      </div>

                      {/* Tab selector */}
                      <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setPdfLayoutMode('single')}
                          className={`py-1.5 px-2 text-[10px] sm:text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            pdfLayoutMode === 'single'
                              ? 'bg-blue-650 text-white shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <Layers className="w-3.5 h-3.5" />
                          Enkelvoudig PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => setPdfLayoutMode('sra3')}
                          className={`py-1.5 px-2 text-[10px] sm:text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            pdfLayoutMode === 'sra3'
                              ? 'bg-blue-650 text-white shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <Grid className="w-3.5 h-3.5" />
                          Imposeer SRA3
                        </button>
                      </div>

                      {/* Conditionally showing configurations */}
                      {pdfLayoutMode === 'single' ? (
                        <div className="space-y-3 text-left">
                          <div className="flex items-center justify-between bg-slate-950/60 p-2.5 rounded-lg border border-slate-850">
                            <div>
                              <span className="text-[10px] font-bold text-slate-200 block">Inclusief snijlijnen</span>
                              <span className="text-[8px] text-slate-400 font-medium">Tekent snijtekens &amp; markeringen (+12mm velmarge)</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPdfWithCropMarks(!pdfWithCropMarks)}
                              className={`w-9 h-5 rounded-full p-0.5 transition-all flex items-center cursor-pointer ${
                                pdfWithCropMarks ? 'bg-blue-650 justify-end' : 'bg-slate-800 justify-start'
                              }`}
                            >
                              <div className="w-4 h-4 bg-white rounded-full shadow-md"></div>
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                              <span className="text-[8px] uppercase font-bold text-slate-400 font-mono">Afloop (Bleed)</span>
                              <select
                                value={pdfBleedMm}
                                onChange={(e) => setPdfBleedMm(Number(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-800 text-[11px] font-bold text-white px-2 py-1 rounded-lg focus:outline-hidden focus:border-blue-500 font-mono"
                              >
                                <option value={0}>0 mm (Geen afloop)</option>
                                <option value={2}>2 mm (Standaard afloop)</option>
                                <option value={3}>3 mm (Ruime afloop)</option>
                                <option value={5}>5 mm (Zeer ruim)</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[8px] uppercase font-bold text-slate-400 font-mono">Kwaliteitbehoud</span>
                              <div className="w-full bg-slate-950/50 border border-slate-850 text-[11px] font-bold text-emerald-400 px-2 py-1 rounded-lg font-mono flex items-center gap-1 select-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                300 DPI Origineel
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* SRA3 LAYOUT ENGINE INFO & OPTIONS */
                        <div className="space-y-3 text-left">
                          {/* Live mathematics statistics layout box */}
                          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850 text-center space-y-1 select-none relative overflow-hidden">
                            <div className="absolute inset-0 bg-blue-500/5 pointer-events-none"></div>
                            <span className="text-[8px] uppercase tracking-wider font-extrabold text-blue-400 font-mono">Verwacht SRA3 velrendement</span>
                            <div className="text-xl font-black text-white font-mono flex items-center justify-center gap-2">
                              <Scissors className="w-4.5 h-4.5 text-blue-400" />
                              <span>{finalYield} kopieën / SRA3</span>
                            </div>
                            <p className="text-[8.5px] text-slate-400 font-semibold leading-tight font-sans">
                              Indeling: <span className="text-white font-mono font-bold">{finalCols} × {finalRows}</span> &bull; {finalRotated ? "Gedraaid (A6)" : "Standaard"} &bull; <span className="text-blue-350">{chosenLabel}</span>
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                              <span className="text-[8px] uppercase font-bold text-slate-400 font-mono">Tussenruimte</span>
                              <select
                                value={pdfGutterMm}
                                onChange={(e) => setPdfGutterMm(Number(e.target.value))}
                                className="w-full bg-slate-950 border border-slate-800 text-[11px] font-bold text-white px-2 py-1 rounded-lg focus:outline-hidden focus:border-blue-500 font-mono"
                              >
                                <option value={2}>2 mm (Standaard tussenruimte)</option>
                                <option value={0}>0 mm (Enkele snijlijn)</option>
                                <option value={4}>4 mm (Kopcut - Randen sluiten aan)</option>
                                <option value={6}>6 mm (Met 2mm witruimte)</option>
                                <option value={8}>8 mm (Met 4mm witruimte)</option>
                                <option value={10}>10 mm (Met 6mm witruimte)</option>
                                <option value={12}>12 mm (Ruime witruimte)</option>
                                <option value={16}>16 mm (Maximale witruimte)</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[8px] uppercase font-bold text-slate-400 font-mono">Oriëntatie SRA3 Sheet</span>
                              <select
                                value={pdfSra3Orientation}
                                onChange={(e) => setPdfSra3Orientation(e.target.value as any)}
                                className="w-full bg-slate-950 border border-slate-800 text-[11px] font-bold text-white px-2 py-1 rounded-lg focus:outline-hidden focus:border-blue-500 font-sans"
                              >
                                <option value="auto">Automatisch (Optimaal)</option>
                                <option value="landscape">Liggend vel (450x320)</option>
                                <option value="portrait">Staand vel (320x450)</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Customer Info Card info sheet list */}
                    <div className="space-y-2 border-t border-slate-150 pt-3.5 font-sans">
                      <span className="text-[9px] uppercase font-black text-slate-400 block font-mono">Klant Contactgegevens</span>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-450 font-sans">Opdrachtgever:</span>
                          <span className="font-extrabold text-slate-850">{previewFile.order.clientName}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-450 font-sans">E-mailadres:</span>
                          <a href={`mailto:${previewFile.order.clientEmail}`} className="font-extrabold text-blue-600 hover:underline">{previewFile.order.clientEmail}</a>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-450 font-sans">Telefoonnummer:</span>
                          <span className="font-bold text-slate-800">{previewFile.order.clientPhone || 'Niet ingevoerd'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Client remarks remark box */}
                    {previewFile.order.clientComments && (
                      <div className="bg-amber-50/40 border border-amber-100 p-3 rounded-xl text-xs mt-1">
                        <span className="text-[9px] uppercase font-bold text-amber-805 block mb-0.5 font-mono">Opmerkingen Klant</span>
                        <p className="text-amber-900 font-sans italic">
                          "{previewFile.order.clientComments}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-slate-150 font-sans">
                  <button
                    type="button"
                    onClick={() => setPreviewFile(null)}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-750 font-bold text-xs rounded-xl transition-all cursor-pointer focus:outline-hidden text-center"
                  >
                    Sluit Inspectie
                  </button>
                  <button
                    type="button"
                    disabled={isGeneratingPdf}
                    onClick={() => handleGeneratePdfAndDownload(previewFile)}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer focus:outline-hidden flex items-center justify-center gap-1.5 shadow-md font-sans"
                  >
                    {isGeneratingPdf ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>PDF Genereren...</span>
                      </>
                    ) : (
                      <>
                        <FileDown className="w-4 h-4" />
                        <span>Genereer PDF Druklaag</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
