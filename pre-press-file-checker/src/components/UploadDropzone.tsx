/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { UploadCloud, File as FileIcon, AlertCircle, Trash2, CheckCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { renderPdfFile } from '../utils/pdfLoader';

interface UploadDropzoneProps {
  onFileLoaded: (
    file: File,
    pixelWidth: number,
    pixelHeight: number,
    imageSrcUrl: string | null,
    backImageSrcUrl?: string | null,
    side?: 'front' | 'back' | 'both',
    detectedPdfPages?: { dataUrl: string; width: number; height: number }[]
  ) => void;
  activeFileName: string | null;
  activeFileSize: number | null;
  activeFileType: string | null;
  backActiveFileName?: string | null;
  backActiveFileSize?: number | null;
  backActiveFileType?: string | null;
  onClearFile: (side?: 'front' | 'back' | 'both') => void;
  printSides?: 'single' | 'double';
}

export default function UploadDropzone({
  onFileLoaded,
  activeFileName,
  activeFileSize,
  activeFileType,
  backActiveFileName,
  backActiveFileSize,
  backActiveFileType,
  onClearFile,
  printSides = 'single',
}: UploadDropzoneProps) {
  const [isFrontDragActive, setIsFrontDragActive] = useState(false);
  const [isBackDragActive, setIsBackDragActive] = useState(false);
  const [isGeneralDragActive, setIsGeneralDragActive] = useState(false);
  
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);
  const generalFileInputRef = useRef<HTMLInputElement>(null);
  
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAnalyzingPdf, setIsAnalyzingPdf] = useState(false);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);

  const processFile = async (file: File, side: 'front' | 'back' | 'both' = 'both') => {
    setErrorMessage(null);
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.pdf')) {
      setErrorMessage('Ondersteund bestandsformaat niet herkend. Upload een PDF, PNG, of JPG bestand voor drukwerk.');
      return;
    }

    const fileSizeMb = file.size / (1024 * 1024);
    if (fileSizeMb > 50) {
      setErrorMessage('Bestandsgrootte overschrijdt de limiet van 50MB. Probeer een gecomprimeerd formaat.');
      return;
    }

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      setIsAnalyzingPdf(true);
      try {
        // Render up to 8 pages of PDF files for comprehensive picking
        const result = await renderPdfFile(file, 8);
        setPdfPageCount(result.pageCount);
        
        if (result.pages.length === 0) {
          throw new Error('PDF bestand bevat geen leesbare pagina\'s.');
        }

        const frontPage = result.pages[0];
        const backPage = result.pages.length > 1 ? result.pages[1] : null;

        if (side === 'both') {
          onFileLoaded(
            file, 
            frontPage.width, 
            frontPage.height, 
            frontPage.dataUrl, 
            backPage ? backPage.dataUrl : null,
            'both',
            result.pages
          );
        } else {
          // If loaded into a single slot, just load that first page into that side
          onFileLoaded(
            file,
            frontPage.width,
            frontPage.height,
            frontPage.dataUrl,
            null,
            side
          );
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Er is een fout opgetreden bij het inlezen en digitaliseren van het PDF-bestand.');
      } finally {
        setIsAnalyzingPdf(false);
      }
    } else {
      setPdfPageCount(null);
      // Image parsing natural coordinates
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          onFileLoaded(file, img.naturalWidth, img.naturalHeight, e.target?.result as string, null, side);
        };
        img.onerror = () => {
          setErrorMessage('Kon de afbeelding niet inladen. Beschadigde metadata of bestandsformaat.');
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrag = (e: React.DragEvent, side: 'front' | 'back' | 'general') => {
    e.preventDefault();
    e.stopPropagation();
    const isEnterOrOver = e.type === 'dragenter' || e.type === 'dragover';

    if (side === 'front') {
      setIsFrontDragActive(isEnterOrOver);
    } else if (side === 'back') {
      setIsBackDragActive(isEnterOrOver);
    } else {
      setIsGeneralDragActive(isEnterOrOver);
    }
  };

  const handleDrop = (e: React.DragEvent, side: 'front' | 'back' | 'general') => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsFrontDragActive(false);
    setIsBackDragActive(false);
    setIsGeneralDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0], side === 'general' ? 'both' : side);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back' | 'both') => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0], side);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileTypeBadge = (type: string | null) => {
    if (!type) return null;
    if (type.includes('pdf')) {
      return (
        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700 border border-red-200">
          PDF
        </span>
      );
    }
    if (type.includes('png')) {
      return (
        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
          PNG
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-brand-red border border-rose-200">
        JPG
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-brand-red mb-2 border border-red-100">
            Stap 3
          </span>
          <h3 className="text-lg font-bold text-slate-900 font-sans">
            {printSides === 'double' ? 'Drukbestanden Toevoegen' : 'Interactieve Upload Zone'}
          </h3>
          <p className="text-sm text-slate-500 mt-1 font-sans">
            {printSides === 'double' 
              ? 'Upload uw documenten voor voorzijde en achterzijde. U kunt een multi-pagina PDF slepen of losse bestanden toevoegen.'
              : 'Schakel over naar dubbelzijdig drukken bij de opties hierboven indien u een voor- en achterkant ontwerp heeft.'}
          </p>
        </div>
      </div>

      {isAnalyzingPdf && (
        <div className="border-2 border-dashed border-red-400 bg-red-50/20 rounded-2xl p-10 text-center flex flex-col items-center justify-center min-h-[220px] animate-pulse">
          <Loader2 className="w-10 h-10 text-brand-red animate-spin mb-4" />
          <h4 className="font-bold text-slate-800 text-sm font-sans">Drukbestanden analyseren...</h4>
          <p className="text-xs text-slate-500 mt-2 font-sans max-w-sm">
            De pagina's worden gedigitaliseerd naar de pre-press canvas module. Een klein moment geduld.
          </p>
        </div>
      )}

      {!isAnalyzingPdf && errorMessage && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-800 text-xs text-left border border-red-100 animate-fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {!isAnalyzingPdf && (
        <>
          {printSides === 'single' ? (
            /* ================= SINGLE SIDED LAYOUT ================= */
            !activeFileName ? (
              <div
                onDragEnter={(e) => handleDrag(e, 'general')}
                onDragOver={(e) => handleDrag(e, 'general')}
                onDragLeave={(e) => handleDrag(e, 'general')}
                onDrop={(e) => handleDrop(e, 'general')}
                onClick={() => generalFileInputRef.current?.click()}
                className={`group border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center min-h-[220px] ${
                  isGeneralDragActive
                    ? 'border-brand-red bg-red-50/50 scale-[0.99]'
                    : 'border-slate-200 hover:border-brand-red hover:bg-slate-50/30'
                }`}
              >
                <input
                  ref={generalFileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => handleFileChange(e, 'both')}
                  className="hidden"
                />

                <div className="flex gap-2.5 mb-4 select-none">
                  <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-xl flex items-center justify-center text-rose-600 shadow-xs group-hover:scale-105 transition-transform">
                    <span className="font-extrabold text-xs">PDF</span>
                  </div>
                  <div className="w-12 h-12 bg-sky-50 border border-sky-100 rounded-xl flex items-center justify-center text-sky-600 shadow-xs group-hover:scale-105 transition-transform delay-75">
                    <span className="font-extrabold text-xs">PNG</span>
                  </div>
                  <div className="w-12 h-12 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center text-amber-600 shadow-xs group-hover:scale-105 transition-transform delay-150">
                    <span className="font-extrabold text-xs">JPG</span>
                  </div>
                </div>

                <p className="font-bold text-slate-800 font-sans text-sm tracking-tight">
                  Sleep uw bestand hierheen, of{' '}
                  <span className="text-brand-red hover:text-brand-red-dark underline group-hover:no-underline font-medium">
                    klik om te bladeren
                  </span>
                </p>
                <p className="text-xs text-slate-400 mt-2 font-sans">
                  Formaten: <strong className="text-slate-600">PDF, JPG, PNG</strong> &bull; Maximaal <strong className="text-slate-600">50MB</strong>
                </p>
              </div>
            ) : (
              /* Loaded file indicator for Single format */
              <div className="border border-slate-200/80 rounded-2xl p-5 bg-slate-50/50 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-red-50 flex items-center justify-center text-brand-red shadow-2xs border border-red-100/50 shrink-0">
                    {activeFileType?.includes('pdf') ? (
                      <FileIcon className="w-7 h-7 text-red-600" />
                    ) : (
                      <ImageIcon className="w-7 h-7 text-brand-red" />
                    )}
                  </div>
                  <div className="space-y-1 overflow-hidden">
                    <h4 className="font-bold text-slate-900 text-sm truncate max-w-xs sm:max-w-md">
                      {activeFileName}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium tracking-tight">
                      <span>{formatBytes(activeFileSize || 0)}</span>
                      <span>&bull;</span>
                      {getFileTypeBadge(activeFileType)}
                      {pdfPageCount !== null && (
                        <>
                          <span>&bull;</span>
                          <span className="px-2 py-0.5 rounded-sm font-bold bg-slate-200 text-slate-700 text-[10px]">
                            {pdfPageCount} {pdfPageCount === 1 ? 'pagina' : "pagina's"} gedetecteerd
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-full border border-emerald-100">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    Bestand actief
                  </span>
                  <button
                    onClick={() => {
                      setPdfPageCount(null);
                      onClearFile('both');
                    }}
                    className="p-2.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-red-700 hover:border-red-200 hover:bg-red-50/50 cursor-pointer transition-colors"
                    title="Bestand verwijderen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          ) : (
            /* ================= DOUBLE SIDED DUAL SLOT LAYOUT ================= */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* SLOT 1: VOORKANT (FRONT) */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Voorzijde (A-Zijde)
                </span>
                
                {!activeFileName ? (
                  <div
                    onDragEnter={(e) => handleDrag(e, 'front')}
                    onDragOver={(e) => handleDrag(e, 'front')}
                    onDragLeave={(e) => handleDrag(e, 'front')}
                    onDrop={(e) => handleDrop(e, 'front')}
                    onClick={() => frontFileInputRef.current?.click()}
                    className={`group border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center min-h-[160px] ${
                      isFrontDragActive
                        ? 'border-brand-red bg-red-50/50 scale-[0.99]'
                        : 'border-slate-200 hover:border-brand-red hover:bg-slate-50/10'
                    }`}
                  >
                    <input
                      ref={frontFileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => handleFileChange(e, 'front')}
                      className="hidden"
                    />
                    <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-brand-red mb-2 transition-transform duration-200 group-hover:-translate-y-0.5" />
                    <p className="font-bold text-slate-800 text-xs tracking-tight leading-snug">
                      Sleep de <strong className="text-brand-red">Voorkant</strong> hier, of blader
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                      PDF, JPG of PNG bestanden
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/40 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-red-50 text-brand-red flex items-center justify-center shrink-0 border border-red-100">
                        {activeFileType?.includes('pdf') ? (
                          <FileIcon className="w-5 h-5 text-red-600" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-brand-red" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-800 text-xs truncate max-w-[130px] sm:max-w-[200px]">
                          {activeFileName}
                        </h4>
                        <p className="text-[10px] text-slate-550 mt-0.5">
                          {formatBytes(activeFileSize || 0)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => onClearFile('front')}
                      className="p-2 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-red-600 hover:border-red-100 hover:bg-red-50/50 transition-all cursor-pointer"
                      title="Wis voorkant"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* SLOT 2: ACHTERKANT (BACK) */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Achterzijde (B-Zijde)
                </span>
                
                {!backActiveFileName ? (
                  <div
                    onDragEnter={(e) => handleDrag(e, 'back')}
                    onDragOver={(e) => handleDrag(e, 'back')}
                    onDragLeave={(e) => handleDrag(e, 'back')}
                    onDrop={(e) => handleDrop(e, 'back')}
                    onClick={() => backFileInputRef.current?.click()}
                    className={`group border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center min-h-[160px] ${
                      isBackDragActive
                        ? 'border-brand-red bg-red-50/50 scale-[0.99]'
                        : 'border-slate-200 hover:border-brand-red hover:bg-slate-50/10'
                    }`}
                  >
                    <input
                      ref={backFileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => handleFileChange(e, 'back')}
                      className="hidden"
                    />
                    <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-brand-red mb-2 transition-transform duration-200 group-hover:-translate-y-0.5" />
                    <p className="font-bold text-slate-800 text-xs tracking-tight leading-snug">
                      Sleep de <strong className="text-brand-red">Achterkant</strong> hier, of blader
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                      PDF, JPG of PNG bestanden
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/40 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-red-50 text-brand-red flex items-center justify-center shrink-0 border border-red-100">
                        {backActiveFileType?.includes('pdf') ? (
                          <FileIcon className="w-5 h-5 text-red-600" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-brand-red" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-800 text-xs truncate max-w-[130px] sm:max-w-[200px]">
                          {backActiveFileName}
                        </h4>
                        <p className="text-[10px] text-slate-550 mt-0.5">
                          {formatBytes(backActiveFileSize || 0)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => onClearFile('back')}
                      className="p-2 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-red-600 hover:border-red-100 hover:bg-red-50/50 transition-all cursor-pointer"
                      title="Wis achterkant"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}
          
          {/* Quick instructions for double sided multi page documents */}
          {printSides === 'double' && (
            <div className="mt-4 p-3.5 rounded-xl border border-red-100 bg-red-50/30 text-xs flex items-center gap-2.5 text-brand-red select-none">
              <FileIcon className="w-5 h-5 text-brand-red shrink-0" />
              <p className="font-medium">
                <strong>Tip:</strong> Heeft u een PDF-bestand met meerdere pagina's? Sleep deze dan simpelweg naar één van de kaders om de pagina's automatisch over beide zijden te verdelen.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
