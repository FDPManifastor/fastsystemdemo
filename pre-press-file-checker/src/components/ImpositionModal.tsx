import React, { useEffect, useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { loadFilePreview } from './ticket/TicketTools';
import { DEFAULT_GAP_MM, PAPER_SIZES, SHEET_PRESETS, buildImposedPdf, detectPaperSize, planImposition } from '../utils/imposition';

interface ImpositionModalProps {
  /** Adres waar het originele bestand opgehaald kan worden. */
  fileUrl: string;
  fileName: string;
  fileType: string;
  productName?: string;
  defaultWidthMm?: number;
  defaultHeightMm?: number;
  /** Slaat het ingeslagen bestand op bij de opdracht als "klaar om te printen". Geeft een foutmelding terug als het niet lukt. */
  onPrintReady?: (pdf: Uint8Array, fileName: string, note: string) => Promise<string | null>;
  onClose: () => void;
}

const field = 'min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 tabular-nums focus:border-[#e31c24] focus:outline-none focus:ring-1 focus:ring-[#e31c24]';
const label = 'block text-[11px] font-bold uppercase text-slate-500';

/** Imposeren: meerdere exemplaren op één drukvel (standaard SRA3), 4 mm ruimte ertussen, met of zonder snijlijnen. */
export default function ImpositionModal({ fileUrl, fileName, fileType, productName, defaultWidthMm, defaultHeightMm, onPrintReady, onClose }: ImpositionModalProps) {
  const detected = detectPaperSize(productName, fileName);
  const startW = defaultWidthMm || detected?.width || 105;
  const startH = defaultHeightMm || detected?.height || 148;
  const startPaper = PAPER_SIZES.find((size) => (size.width === startW && size.height === startH) || (size.width === startH && size.height === startW));

  const [paperId, setPaperId] = useState<string>(startPaper?.id || 'custom');
  const [designLandscape, setDesignLandscape] = useState(startW > startH);
  const [customW, setCustomW] = useState(String(Math.min(startW, startH)));
  const [customH, setCustomH] = useState(String(Math.max(startW, startH)));
  const [sheetId, setSheetId] = useState<string>('sra3');
  const [gap, setGap] = useState(String(DEFAULT_GAP_MM));
  const [bleed, setBleed] = useState('0');
  const [cropMarks, setCropMarks] = useState(true);
  const [manual, setManual] = useState(false);
  const [manualColumns, setManualColumns] = useState('1');
  const [manualRows, setManualRows] = useState('1');
  const [manualLandscape, setManualLandscape] = useState(false);
  const [busy, setBusy] = useState<'' | 'download' | 'ready'>('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [artworkUrl, setArtworkUrl] = useState('');

  useEffect(() => {
    let active = true;
    setArtworkUrl('');
    (async () => {
      try {
        const response = await fetch(fileUrl, { credentials: 'include' });
        if (!response.ok) return;
        const blob = await response.blob();
        const loaded = await loadFilePreview(new File([blob], fileName, { type: fileType || blob.type }));
        if (active) setArtworkUrl(loaded.url);
      } catch {
        // Zonder voorbeeldafbeelding blijft het schema met gekleurde vlakken staan.
      }
    })();
    return () => { active = false; };
  }, [fileUrl, fileName, fileType]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const number = (text: string) => Number(text.replace(',', '.'));

  const settings = useMemo(() => {
    const paper = PAPER_SIZES.find((size) => size.id === paperId);
    const base = paper ? { w: paper.width, h: paper.height } : { w: number(customW), h: number(customH) };
    const trimWidthMm = designLandscape ? Math.max(base.w, base.h) : Math.min(base.w, base.h);
    const trimHeightMm = designLandscape ? Math.min(base.w, base.h) : Math.max(base.w, base.h);
    const preset = SHEET_PRESETS.find((entry) => entry.id === sheetId) || SHEET_PRESETS[0];
    const common = { trimWidthMm, trimHeightMm, bleedMm: number(bleed), gapMm: number(gap), cropMarks };
    const portrait = { ...common, sheetWidthMm: preset.width, sheetHeightMm: preset.height };
    const landscape = { ...common, sheetWidthMm: preset.height, sheetHeightMm: preset.width };
    if (manual) {
      return { ...(manualLandscape ? landscape : portrait), columns: Number(manualColumns), rows: Number(manualRows) };
    }
    const p = planImposition({ ...portrait, columns: 1, rows: 1 });
    const l = planImposition({ ...landscape, columns: 1, rows: 1 });
    const useLandscape = l.maxColumns * l.maxRows > p.maxColumns * p.maxRows;
    const best = useLandscape ? l : p;
    return { ...(useLandscape ? landscape : portrait), columns: Math.max(1, best.maxColumns), rows: Math.max(1, best.maxRows) };
  }, [paperId, designLandscape, customW, customH, sheetId, gap, bleed, cropMarks, manual, manualColumns, manualRows, manualLandscape]);

  const plan = useMemo(() => planImposition(settings), [settings]);
  const perSheet = settings.columns * settings.rows;
  const sheetLandscape = settings.sheetWidthMm > settings.sheetHeightMm;
  const sheetName = (SHEET_PRESETS.find((entry) => entry.id === sheetId) || SHEET_PRESETS[0]).name.split(' (')[0];
  const sizeName = PAPER_SIZES.find((size) => size.id === paperId)?.id || `${settings.trimWidthMm}×${settings.trimHeightMm} mm`;
  const summary = `${perSheet} × ${sizeName} op ${sheetName}${plan.gapMm ? ` · ${plan.gapMm} mm ruimte` : ''} · ${cropMarks ? 'met snijlijnen' : 'zonder snijlijnen'}`;
  const outName = `${fileName.replace(/\.[^.]+$/, '')}_${perSheet}-op-${sheetName}${cropMarks ? '' : '_zonder-snijlijnen'}.pdf`;

  const editManual = (change: () => void) => {
    if (!manual) {
      setManualColumns(String(settings.columns));
      setManualRows(String(settings.rows));
      setManualLandscape(sheetLandscape);
      setManual(true);
    }
    change();
  };

  const build = async () => {
    const response = await fetch(fileUrl, { credentials: 'include' });
    if (!response.ok) throw new Error('Het originele bestand kon niet worden opgehaald.');
    return buildImposedPdf(new Uint8Array(await response.arrayBuffer()), fileType, settings);
  };

  const download = async () => {
    setBusy('download');
    setError('');
    try {
      const result = await build();
      const url = URL.createObjectURL(new Blob([result as unknown as BlobPart], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = outName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Het imposeren is mislukt.');
    } finally {
      setBusy('');
    }
  };

  const markReady = async () => {
    if (!onPrintReady) return;
    setBusy('ready');
    setError('');
    setDone('');
    try {
      const result = await build();
      const failure = await onPrintReady(result, outName, summary);
      if (failure) setError(failure);
      else setDone('Opgeslagen bij de opdracht: dit bestand is klaar om te printen.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Het imposeren is mislukt.');
    } finally {
      setBusy('');
    }
  };

  const viewScale = 280 / Math.max(settings.sheetWidthMm || 1, settings.sheetHeightMm || 1);
  const sheetW = (settings.sheetWidthMm || 0) * viewScale;
  const sheetH = (settings.sheetHeightMm || 0) * viewScale;

  return (
    <div role="dialog" aria-modal="true" aria-label={`Imposeren van ${fileName}`} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/70 p-3 font-sans sm:p-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white text-left shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#e31c24]">Imposeren: meerdere op één vel</p>
            <h3 className="break-words text-lg font-extrabold text-slate-900">{productName || fileName}</h3>
            <p className="break-all text-xs text-slate-500">{fileName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Sluiten" className="min-h-[44px] min-w-[44px] rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="mx-auto h-6 w-6" />
          </button>
        </header>

        <div className="grid gap-5 p-4 md:grid-cols-[1fr_18rem]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 space-y-1">
                <span className={label}>1. Formaat van het ontwerp</span>
                <select value={paperId} onChange={(event) => { setPaperId(event.target.value); setManual(false); }} className={field}>
                  {PAPER_SIZES.map((size) => <option key={size.id} value={size.id}>{size.name}</option>)}
                  <option value="custom">Eigen formaat</option>
                </select>
              </label>
              {paperId === 'custom' && (
                <>
                  <label className="space-y-1"><span className={label}>Breedte (mm)</span><input inputMode="decimal" value={customW} onChange={(event) => { setCustomW(event.target.value); setManual(false); }} className={field} /></label>
                  <label className="space-y-1"><span className={label}>Hoogte (mm)</span><input inputMode="decimal" value={customH} onChange={(event) => { setCustomH(event.target.value); setManual(false); }} className={field} /></label>
                </>
              )}
              <label className="col-span-2 flex min-h-[44px] items-center gap-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={designLandscape} onChange={(event) => { setDesignLandscape(event.target.checked); setManual(false); }} className="h-5 w-5 accent-[#e31c24]" />
                Ontwerp ligt liggend
              </label>
            </div>

            <label className="block space-y-1">
              <span className={label}>2. Drukvel</span>
              <select value={sheetId} onChange={(event) => { setSheetId(event.target.value); setManual(false); }} className={field}>
                {SHEET_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}{preset.id === 'sra3' ? ' (standaard)' : ''}</option>)}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1"><span className={label}>3. Ruimte tussen ontwerpen (mm)</span><input inputMode="decimal" value={gap} onChange={(event) => setGap(event.target.value)} className={field} /></label>
              <label className="space-y-1"><span className={label}>Afloop (mm, 0 = geen)</span><input inputMode="decimal" value={bleed} onChange={(event) => setBleed(event.target.value)} className={field} /></label>
            </div>

            <fieldset className="space-y-1">
              <legend className={label}>4. Snijlijnen</legend>
              <div className="grid grid-cols-2 gap-2">
                {[{ value: true, text: 'Met snijlijnen' }, { value: false, text: 'Zonder snijlijnen' }].map((option) => (
                  <button key={String(option.value)} type="button" aria-pressed={cropMarks === option.value} onClick={() => { setCropMarks(option.value); setManual(false); }} className={`min-h-[48px] rounded-xl border text-sm font-extrabold ${cropMarks === option.value ? 'border-[#e31c24] bg-[#e31c24] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                    {option.text}
                  </button>
                ))}
              </div>
            </fieldset>

            <details className="rounded-xl border border-slate-200 p-3" open={manual}>
              <summary className="min-h-[32px] cursor-pointer text-xs font-bold text-slate-600">Aantallen zelf aanpassen</summary>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="space-y-1"><span className={label}>Naast elkaar</span><input type="number" min="1" max="50" value={manual ? manualColumns : settings.columns} onChange={(event) => editManual(() => setManualColumns(event.target.value))} className={field} /></label>
                <label className="space-y-1"><span className={label}>Onder elkaar</span><input type="number" min="1" max="50" value={manual ? manualRows : settings.rows} onChange={(event) => editManual(() => setManualRows(event.target.value))} className={field} /></label>
                <label className="col-span-2 flex min-h-[44px] items-center gap-3 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={manual ? manualLandscape : sheetLandscape} onChange={(event) => editManual(() => setManualLandscape(event.target.checked))} className="h-5 w-5 accent-[#e31c24]" />
                  Vel liggend gebruiken
                </label>
                {manual && <button type="button" onClick={() => setManual(false)} className="col-span-2 min-h-[44px] rounded-lg border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">Terug naar automatisch vullen</button>}
              </div>
            </details>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-center rounded-xl bg-slate-100 p-3" style={{ minHeight: 280 }}>
              {plan.valid && (
                <svg width={sheetW} height={sheetH} viewBox={`0 0 ${settings.sheetWidthMm} ${settings.sheetHeightMm}`} role="img" aria-label={`Vel met ${perSheet} exemplaren`} className="bg-white shadow">
                  {Array.from({ length: settings.rows }).flatMap((_, row) => Array.from({ length: settings.columns }).map((__, column) => {
                    const x = plan.originXMm + column * plan.pitchWidthMm;
                    const y = settings.sheetHeightMm - (plan.originYMm + row * plan.pitchHeightMm + settings.trimHeightMm);
                    return (
                      <g key={`${row}-${column}`}>
                        {artworkUrl ? (
                          <svg x={x - plan.bleedMm} y={y - plan.bleedMm} width={settings.trimWidthMm + 2 * plan.bleedMm} height={settings.trimHeightMm + 2 * plan.bleedMm} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="hidden">
                            <image href={artworkUrl} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" />
                          </svg>
                        ) : (
                          <rect x={x} y={y} width={settings.trimWidthMm} height={settings.trimHeightMm} fill={plan.fits ? '#e31c24' : '#f59e0b'} opacity="0.85" />
                        )}
                        <rect x={x} y={y} width={settings.trimWidthMm} height={settings.trimHeightMm} fill="none" stroke={plan.fits ? '#0f172a' : '#b45309'} strokeWidth="0.4" strokeDasharray="1.5 1" />
                      </g>
                    );
                  }))}
                </svg>
              )}
            </div>
            <p className={`rounded-lg p-2.5 text-sm font-semibold ${plan.fits ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
              {!plan.valid
                ? 'Vul geldige maten in.'
                : plan.fits
                  ? summary
                  : `Past niet op dit vel. Maximaal ${plan.maxColumns} × ${plan.maxRows}.`}
            </p>
            {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm font-semibold text-rose-800">{error}</p>}
            {done && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm font-bold text-emerald-900">✓ {done}</p>}
            {onPrintReady && (
              <button type="button" disabled={!!busy || !plan.fits} onClick={markReady} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 text-base font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                {busy === 'ready' ? 'Bezig…' : '✓ Klaar om te printen'}
              </button>
            )}
            <button type="button" disabled={!!busy || !plan.fits} onClick={download} className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
              <Download className="h-4 w-4" /> {busy === 'download' ? 'Pdf wordt gemaakt…' : 'Alleen pdf downloaden'}
            </button>
            <p className="text-[11px] leading-snug text-slate-500">“Klaar om te printen” bewaart het ingeslagen vel bij de opdracht, zodat iedereen het kan openen en printen. Een pdf met meerdere pagina's geeft één vel per pagina.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
