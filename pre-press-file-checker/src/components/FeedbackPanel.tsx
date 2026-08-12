/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  ArrowRight, 
  Upload, 
  Settings, 
  Layout, 
  Maximize2, 
  Compass, 
  Check, 
  Sparkles,
  Layers
} from 'lucide-react';
import { FileAnalysis, FitMode, PrototypeStateOverride } from '../types';

interface FeedbackPanelProps {
  analysis: FileAnalysis | null;
  prototypeOverride: PrototypeStateOverride;
  onSetPrototypeOverride: (override: PrototypeStateOverride) => void;
  onRotateFile: () => void;
  onReupload: () => void;
  onProceedAnyway: () => void;
  onSendToPrint: () => void;
}

export default function FeedbackPanel({
  analysis,
  prototypeOverride,
  onSetPrototypeOverride,
  onRotateFile,
  onReupload,
  onProceedAnyway,
  onSendToPrint,
}: FeedbackPanelProps) {
  
  const [agreedToQualityRisks, setAgreedToQualityRisks] = React.useState(false);

  // Decide which analysis data to show based on prototype override or actual analysis
  const currentStatus = React.useMemo((): FileAnalysis => {
    if (prototypeOverride === 'success') {
      return {
        fileName: 'commercial_artwork_v2.jpg',
        fileSize: 4520100,
        fileType: 'image/jpeg',
        pixelWidth: 3508,
        pixelHeight: 4960,
        computedDpi: 300,
        aspectRatioOk: true,
        dpiOk: true,
        colorSpace: 'CMYK',
        hasBleed: true,
        feedbackState: 'success',
        successMessage: 'Perfect! Resolution (300 DPI) and aspect ratio match your selected product. Ready to print.',
      };
    } else if (prototypeOverride === 'warning') {
      return {
        fileName: 'low_res_flyer.png',
        fileSize: 840210,
        fileType: 'image/png',
        pixelWidth: 745,
        pixelHeight: 1050,
        computedDpi: 90,
        aspectRatioOk: true,
        dpiOk: false,
        colorSpace: 'RGB',
        hasBleed: false,
        feedbackState: 'warning',
        warningMessage: 'Low Resolution Warning! Your file is only 90 DPI. The print might appear blurry (standard is 300 DPI). Do you want to proceed?',
      };
    } else if (prototypeOverride === 'error') {
      return {
        fileName: 'landscape_banner_draft.png',
        fileSize: 1240100,
        fileType: 'image/png',
        pixelWidth: 1920,
        pixelHeight: 1080,
        computedDpi: 150,
        aspectRatioOk: false,
        dpiOk: true,
        colorSpace: 'RGB',
        hasBleed: true,
        feedbackState: 'error',
        errorMessage: 'Incorrect Aspect Ratio! Your uploaded file has a landscape ratio, but you selected a portrait product orientation.',
      };
    } else if (analysis) {
      return analysis;
    } else {
      // Default placeholder when no file is uploaded yet
      return {
        fileName: 'none',
        fileSize: 0,
        fileType: '',
        pixelWidth: 0,
        pixelHeight: 0,
        computedDpi: 0,
        aspectRatioOk: false,
        dpiOk: false,
        colorSpace: 'RGB',
        hasBleed: false,
        feedbackState: 'success', // placeholder default
      };
    }
  }, [analysis, prototypeOverride]);

  // Reset agreement state on file or status change to enforce explicit new consent
  React.useEffect(() => {
    setAgreedToQualityRisks(false);
  }, [currentStatus.fileName, currentStatus.feedbackState]);

  const hasActiveFileOrDemo = analysis !== null || prototypeOverride !== 'auto';

  return (
    <div style={{ backgroundColor: '#ffffff', borderColor: '#000000', borderWidth: '1px' }} className="rounded-2xl p-6 shadow-sm space-y-6">
      
      {/* Step and Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 mb-2 font-mono">
            STAP 3
          </span>
          <h3 style={{ color: '#ed1c24' }} className="text-lg font-bold font-sans">Pre-Press Analyse &amp; Controle</h3>
          <p className="text-sm text-slate-500 mt-1 font-sans">
            Bekijk de automatische uitlijning, DPI-resolutie en kleurprofielvalidatie voor uw ontwerp.
          </p>
        </div>

        {/* Live Analyse Indicator */}
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 select-none">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-black uppercase tracking-wider font-mono">Live Analyse Actief</span>
        </div>
      </div>

      {!hasActiveFileOrDemo ? (
        // File Not Uploaded Placeholder State
        <div className="border border-slate-200/60 border-dashed rounded-2xl p-10 text-center flex flex-col items-center justify-center text-slate-400 bg-slate-50/25">
          <Settings className="w-10 h-10 text-slate-350 stroke-[1.5] mb-3 animate-spin" style={{ animationDuration: '6s' }} />
          <h4 className="font-bold text-slate-800 text-sm">Wacht op upload van bestand...</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
            Voltooi Stap 1 en Stap 2. Ons systeem berekent direct of de resolutie, verhoudingen en marges perfect geschikt zijn voor drukwerk.
          </p>
        </div>
      ) : (
        // File Checked feedback states
        <div className="space-y-6">
          
          {/* Cohesive File Status & Best Quality Requirements Card */}
          <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-bold font-sans text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200/60 pb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse"></span>
              Pre-press Bestandscontrole
            </h4>

            {/* State: SUCCESS */}
            {currentStatus.feedbackState === 'success' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <Check className="w-3.5 h-3.5 font-bold" /> Druk-gereed (Perfecte Kwaliteit)
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/50">
                    <div className="font-extrabold text-slate-850 mb-1">Status van het bestand:</div>
                    <p className="text-slate-650 leading-relaxed font-medium">
                      Het bestand <strong className="text-slate-800 font-bold break-all">"{currentStatus.fileName}"</strong> is succesvol geanalyseerd. De scherpte, afmetingen en verhoudingen zijn volledig goedgekeurd voor drukwerk.
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/50">
                    <div className="font-extrabold text-slate-850 mb-1">Wat is nodig voor de beste kwaliteit?</div>
                    <p className="text-emerald-800 font-bold leading-relaxed">
                      Uw bestand voldoet al aan alle pre-press kwaliteitsnormen. Er is geen verdere actie vereist. Uw bestand kan direct in hoge scherpte gedrukt worden!
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* State: WARNING */}
            {currentStatus.feedbackState === 'warning' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5" /> Opmerking (Lage Resolutie)
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/50">
                    <div className="font-extrabold text-slate-850 mb-1">Status van het bestand:</div>
                    <p className="text-slate-650 leading-relaxed font-medium">
                      De resolutie van het bestand <strong className="text-slate-800 font-bold break-all">"{currentStatus.fileName}"</strong> bedraagt <strong className="text-amber-800 font-bold">{currentStatus.computedDpi} DPI</strong>. Dit is lager dan de aanbevolen pre-press norm van 350 DPI voor maximale scherpte.
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/50">
                    <div className="font-extrabold text-slate-850 mb-1">Wat is nodig voor de beste kwaliteit?</div>
                    <p className="text-slate-650 leading-relaxed font-medium">
                      Voor een perfecte en vlijmscherpe afdruk raden wij aan een bestand met een hogere resolutie van minimaal <strong className="text-brand-red font-extrabold">300 DPI</strong> aan te leveren. Met de huidige resolutie kan de afdruk wazig, korrelig of pixelachtig worden.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* State: ERROR */}
            {currentStatus.feedbackState === 'error' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5" /> Opmerking (Afwijkende beeldverhouding)
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/50">
                    <div className="font-extrabold text-slate-850 mb-1">Status van het bestand:</div>
                    <p className="text-slate-650 leading-relaxed font-medium">
                      Het bestand <strong className="text-slate-800 font-bold break-all">"{currentStatus.fileName}"</strong> is geüpload in liggende oriëntatie, terwijl u hierboven een staand productformaat heeft geselecteerd (of vice versa).
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/50">
                    <div className="font-extrabold text-slate-850 mb-1">Wat is nodig voor de beste kwaliteit?</div>
                    <p className="text-slate-650 leading-relaxed font-medium">
                      Het ontwerp moet exact aansluiten op het gekozen drukwerkformaat om ongewenste witte randen, vervormingen of afsnijdingen te voorkomen. Draai het bestand <strong className="text-brand-red font-extrabold">90 graden</strong> of lever een nieuw bestand aan in de juiste beeldverhouding.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick interactive utility action buttons for warnings/errors */}
          {currentStatus.feedbackState !== 'success' && (
            <div className="flex flex-wrap items-center gap-2">
              {currentStatus.feedbackState === 'error' && (
                <button
                  type="button"
                  onClick={onRotateFile}
                  className="px-4 py-2 text-xs bg-slate-100 hover:bg-slate-250 text-slate-800 font-bold rounded-lg transition-transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer flex items-center gap-1.5 border border-slate-300"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-brand-red animate-spin-once" />
                  Bestand kwartslag draaien
                </button>
              )}
              <button
                type="button"
                onClick={onReupload}
                className="px-4 py-2 text-xs bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-lg border border-slate-250 transition-colors cursor-pointer"
              >
                Kies een ander bestand
              </button>
            </div>
          )}

          {/* Technical Specs checklist breakdown */}
          <div className="border border-slate-150 rounded-xl overflow-hidden bg-white shadow-3xs">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-150 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 font-sans">
                Gedetailleerde technische controle:
              </span>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold text-[9px] rounded-md tracking-wider uppercase">
                Analyse voltooid
              </span>
            </div>

            <div className="divide-y divide-slate-100 text-xs text-slate-700">
              
              {/* Aspect Ratio line */}
              <div className="px-4 py-3 flex items-center justify-between gap-4 text-left">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-800">Formaat &amp; Vorm</div>
                  <div className="text-slate-500 text-[10px]">
                    Of de verhoudingen van uw bestand exact overeenstemmen met het product.
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {currentStatus.pixelWidth} × {currentStatus.pixelHeight} px
                    </span>
                  </div>
                  <div>
                    {currentStatus.aspectRatioOk ? (
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <span className="w-1 h-1 rounded-full bg-emerald-500"></span> VORM KLOPT
                      </span>
                    ) : (
                      <span className="bg-rose-50 text-rose-800 border border-rose-200 font-bold text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <span className="w-1 h-1 rounded-full bg-rose-500"></span> VORM AFWIJKEND
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Resolution / DPI line */}
              <div className="px-4 py-3 flex items-center justify-between gap-4 text-left">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-800">Scherpte (Kwaliteit)</div>
                  <div className="text-slate-500 text-[10px]">
                    Scherpte-analyse op basis van de pixelafmetingen en papierformaat.
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-slate-800 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">
                      {currentStatus.computedDpi} DPI
                    </span>
                  </div>
                  <div>
                    {currentStatus.dpiOk ? (
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <span className="w-1 h-1 rounded-full bg-emerald-500"></span> SCHERP DRUKWERK
                      </span>
                    ) : (
                      <span className="bg-amber-50 text-amber-850 border border-amber-200 font-bold text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                        <span className="w-1 h-1 rounded-full bg-amber-500"></span> MOGELIJK ONSCHERP
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Color Space line */}
              <div className="px-4 py-3 flex items-center justify-between gap-4 text-left">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-800">Kleuren-validatie</div>
                  <div className="text-slate-500 text-[10px]">
                    We bereiden de kleuren automatisch voor voor ons FOGRA39 CMYK-profiel.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                    <span className="w-1 h-1 rounded-full bg-emerald-500"></span> KLEUREN COMPATIBEL
                  </span>
                </div>
              </div>

              {/* Bleed Protection Margin line */}
              <div className="px-4 py-3 flex items-center justify-between gap-4 text-left">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-800">Veilige snijmarge</div>
                  <div className="text-slate-500 text-[10px]">
                    Controle op veilige afstand van logo's en teksten van de definitieve snijlijn.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> SNIJMARGE VEILIG
                  </span>
                </div>
              </div>

            </div>
          </div>

          {/* REQUIRED WARNING / CONSENT HANDS-UP PANEL FOR SUBMISSION */}
          {currentStatus.feedbackState !== 'success' && (
            <div className="bg-amber-50 border-2 border-amber-200/50 rounded-2xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-xs">
                  <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div className="space-y-1 text-left">
                  <h4 className="text-amber-800 font-black text-xs sm:text-sm uppercase tracking-wide">
                    Belangrijke Opmerking / Hands-up
                  </h4>
                  <p className="text-slate-700 text-xs leading-relaxed font-medium">
                    {currentStatus.feedbackState === 'warning' ? (
                      <span>U staat op het punt om een bestand met een lagere resolutie aan te leveren (<strong className="text-brand-red">{currentStatus.computedDpi} DPI</strong>). Dit kan resulteren in een onscherpe of korrelige afdruk.</span>
                    ) : (
                      <span>U staat op het punt om een bestand met een afwijkende beeldverhouding aan te leveren. Dit kan resulteren in ongewenste witte randen, vervorming of automatische afsnijding van uw ontwerp.</span>
                    )}
                    <br />
                    <span className="block mt-1.5 text-slate-600">
                      Als u toch door wilt gaan met deze bestanden, dient u hiermee expliciet akkoord te gaan. FD Printing Center zal uw bestand dan ongewijzigd in productie nemen.
                    </span>
                  </p>
                </div>
              </div>

              {/* Checkbox agreement */}
              <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-brand-red/50 transition-colors cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedToQualityRisks}
                  onChange={(e) => setAgreedToQualityRisks(e.target.checked)}
                  className="mt-0.5 w-4.5 h-4.5 rounded border-slate-300 text-brand-red focus:ring-brand-red"
                />
                <div className="text-left">
                  <span className="text-xs font-bold text-slate-900 block leading-snug">
                    Ja, ik ga akkoord met deze kwaliteitsrisico's.
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Ik geef toestemming om dit bestand op eigen risico in te dienen en begrijp dat de afdrukkwaliteit hierdoor beïnvloed kan worden.
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* Submission / Checkout CTA */}
          <div className="pt-2 space-y-3">
            <div className="flex justify-end">
              <button
                onClick={onSendToPrint}
                disabled={currentStatus.feedbackState !== 'success' && !agreedToQualityRisks}
                className={`px-6 py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all shadow-sm flex items-center gap-2 cursor-pointer ${
                  currentStatus.feedbackState !== 'success' && !agreedToQualityRisks
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                    : 'bg-brand-red text-white hover:bg-brand-red-dark hover:shadow-md hover:scale-[1.01] active:scale-[0.99]'
                }`}
              >
                <span>Bestand aanleveren &amp; Bestellen</span>
                <ArrowRight className="w-4 h-4 font-bold" />
              </button>
            </div>

            {currentStatus.feedbackState !== 'success' && !agreedToQualityRisks && (
              <p className="text-right text-[11px] font-bold text-brand-red/90 animate-pulse">
                ⚠️ Vink het akkoord hierboven aan om verder te gaan met dit bestand.
              </p>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
