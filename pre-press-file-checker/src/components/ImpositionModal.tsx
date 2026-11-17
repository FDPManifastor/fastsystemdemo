import React, { useEffect, useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { loadFilePreview } from './ticket/TicketTools';
import { SHEET_PRESETS, buildImposedPdf, planImposition } from '../utils/imposition';

interface ImpositionModalProps {
  /** Adres waar het originele bestand opgehaald kan worden. */
  fileUrl: string;
  fileName: string;
  fileType: string;
  productName?: string;
  defaultWidthMm?: number;
  defaultHeightMm?: number;
  onClose: () => void;
}

const field = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 tabular-nums focus:border-[#e31c24] focus:outline-none focus:ring-1 focus:ring-[#e31c24]';
const label = 'block text-[10px] font-bold uppercase text-slate-500';

/** Inslaan in het backoffice: standaard 4 op een vel met snijlijnen en 2 mm afloop, alles instelbaar. */
export default function ImpositionModal({ fileUrl, fileName, fileType, productName, defaultWidthMm, defaultHeightMm, onClose }: ImpositionModalProps) {
  const [sheetId, setSheetId] = useState<string>('sra3');
  const [customSheetW, setCustomSheetW] = useState('320');
  const [customSheetH, setCustomSheetH] = useState('450');
  const [landscape, setLandscape] = useState(false);
  const [columns, setColumns] = useState('2');
  const [rows, setRows] = useState('2');
  const [trimW, setTrimW] = useState(String(defaultWidthMm || 148));
  const [trimH, setTrimH] = useState(String(defaultHeightMm || 210));
  const [bleed, setBleed] = useState('2');
  const [cropMarks, setCropMarks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [artworkUrl, setArtworkUrl] = useState('');

  // Haal het ontwerp op (pdf: pagina 1) zodat het voorbeeld het echte ontwerp laat zien.
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
    return () => {
      active = false;
    };
  }, [fileUrl, fileName, fileType]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const number = (text: string) => Number(text.replace(',', '.'));
  const settings = useMemo(() => {
    const preset = SHEET_PRESETS.find((entry) => entry.id === sheetId);
    const shortSide = preset ? preset.width : number(customSheetW);
    const longSide = preset ? preset.height : number(customSheetH);
    const portraitW = Math.min(shortSide, longSide);
    const portraitH = Math.max(shortSide, longSide);
    return {
      sheetWidthMm: landscape ? portraitH : portraitW,
      sheetHeightMm: landscape ? portraitW : portraitH,
      columns: Number(columns),
      rows: Number(rows),
      trimWidthMm: number(trimW),
      trimHeightMm: number(trimH),
      bleedMm: number(bleed),
      cropMarks,
    };
  }, [sheetId, customSheetW, customSheetH, landscape, columns, rows, trimW, trimH, bleed, cropMarks]);
  const plan = useMemo(() => planImposition(settings), [settings]);
  const perSheet = settings.columns * settings.rows;

  const fillSheet = () => {
    // Kies de vel-oriëntatie waarop de meeste exemplaren passen.
    const portrait = planImposition({ ...settings, sheetWidthMm: Math.min(settings.sheetWidthMm, settings.sheetHeightMm), sheetHeightMm: Math.max(settings.sheetWidthMm, settings.sheetHeightMm) });
    const landscapePlan = planImposition({ ...settings, sheetWidthMm: Math.max(settings.sheetWidthMm, settings.sheetHeightMm), sheetHeightMm: Math.min(settings.sheetWidthMm, settings.sheetHeightMm) });
    const useLandscape = landscapePlan.maxColumns * landscapePlan.maxRows > portrait.maxColumns * portrait.maxRows;
    const best = useLandscape ? landscapePlan : portrait;
    if (best.maxColumns * best.maxRows === 0) {
      setError('Dit formaat past niet op het gekozen vel. Kies een groter vel of een kleiner eindformaat.');
      return;
    }
    setError('');
    setLandscape(useLandscape);
    setColumns(String(best.maxColumns));
    setRows(String(best.maxRows));
  };

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(fileUrl, { credentials: 'include' });
      if (!response.ok) throw new Error('Het originele bestand kon niet worden opgehaald.');
      const source = new Uint8Array(await response.arrayBuffer());
      const result = await buildImposedPdf(source, fileType, settings);
      const url = URL.createObjectURL(new Blob([result as unknown as BlobPart], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName.replace(/\.[^.]+$/, '')}_${perSheet}-op_${settings.sheetWidthMm}x${settings.sheetHeightMm}mm.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (downloadError) {
      console.error('Inslaan mislukt:', downloadError);
      setError(downloadError instanceof Error ? downloadError.message : 'Het inslaan is mislukt.');
    } finally {
      setBusy(false);
    }
  };

  // Schematische weergave van het vel
  const viewScale = 260 / Math.max(settings.sheetWidthMm || 1, settings.sheetHeightMm || 1);
  const sheetW = (settings.sheetWidthMm || 0) * viewScale;
  const sheetH = (settings.sheetHeightMm || 0) * viewScale;

  return (
    <div role="dialog" aria-modal="true" aria-label={`Inslaan van ${fileName}`} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/70 p-3 font-sans sm:p-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white text-left shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#e31c24]">Inslaan (imposition)</p>
            <h3 className="break-words text-base font-extrabold text-slate-900">{productName || fileName}</h3>
            <p className="break-all text-xs text-slate-500">{fileName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Sluiten" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-5 p-4 md:grid-cols-[1fr_17rem]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 space-y-1">
                <span className={label}>Drukvel</span>
                <select value={sheetId} onChange={(event) => setSheetId(event.target.value)} className={field}>
                  {SHEET_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                  <option value="custom">Eigen formaat</option>
                </select>
              </label>
              {sheetId === 'custom' && (
                <>
                  <label className="space-y-1"><span className={label}>Vel breedte (mm)</span><input inputMode="decimal" value={customSheetW} onChange={(event) => setCustomSheetW(event.target.value)} className={field} /></label>
                  <label className="space-y-1"><span className={label}>Vel hoogte (mm)</span><input inputMode="decimal" value={customSheetH} onChange={(event) => setCustomSheetH(event.target.value)} className={field} /></label>
                </>
              )}
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={landscape} onChange={(event) => setLandscape(event.target.checked)} className="h-4 w-4 accent-[#e31c24]" />
                Vel liggend gebruiken
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1"><span className={label}>Eindformaat breedte (mm)</span><input inputMode="decimal" value={trimW} onChange={(event) => setTrimW(event.target.value)} className={field} /></label>
              <label className="space-y-1"><span className={label}>Eindformaat hoogte (mm)</span><input inputMode="decimal" value={trimH} onChange={(event) => setTrimH(event.target.value)} className={field} /></label>
              <label className="space-y-1"><span className={label}>Naast elkaar</span><input type="number" min="1" max="50" step="1" value={columns} onChange={(event) => setColumns(event.target.value)} className={field} /></label>
              <label className="space-y-1"><span className={label}>Onder elkaar</span><input type="number" min="1" max="50" step="1" value={rows} onChange={(event) => setRows(event.target.value)} className={field} /></label>
              <label className="space-y-1"><span className={label}>Afloop (mm)</span><input inputMode="decimal" value={bleed} onChange={(event) => setBleed(event.target.value)} className={field} /></label>
              <label className="flex items-center gap-2 self-end rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" checked={cropMarks} onChange={(event) => setCropMarks(event.target.checked)} className="h-4 w-4 accent-[#e31c24]" />
                Snijlijnen
              </label>
            </div>

            <button type="button" onClick={fillSheet} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              Vel maximaal vullen
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-center rounded-xl bg-slate-100 p-3" style={{ minHeight: 280 }}>
              {plan.valid && (
                <svg width={sheetW} height={sheetH} viewBox={`0 0 ${settings.sheetWidthMm} ${settings.sheetHeightMm}`} role="img" aria-label={`Vel met ${perSheet} exemplaren`} className="bg-white shadow">
                  {Array.from({ length: settings.rows }).flatMap((_, row) => Array.from({ length: settings.columns }).map((__, column) => {
                    const x = plan.offsetXMm + column * plan.cellWidthMm;
                    const y = plan.offsetYMm + row * plan.cellHeightMm;
                    return (
                      <g key={`${row}-${column}`}>
                        <rect x={x} y={y} width={plan.cellWidthMm} height={plan.cellHeightMm} fill={plan.fits ? '#fecaca' : '#fde68a'} />
                        {artworkUrl ? (
                          <svg x={x} y={y} width={plan.cellWidthMm} height={plan.cellHeightMm} viewBox="0 0 100 100" preserveAspectRatio="none" overflow="hidden">
                            <image href={artworkUrl} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" />
                          </svg>
                        ) : (
                          <rect x={x + settings.bleedMm} y={y + settings.bleedMm} width={settings.trimWidthMm} height={settings.trimHeightMm} fill={plan.fits ? '#e31c24' : '#f59e0b'} opacity="0.85" />
                        )}
                        <rect x={x + settings.bleedMm} y={y + settings.bleedMm} width={settings.trimWidthMm} height={settings.trimHeightMm} fill="none" stroke={plan.fits ? '#0f172a' : '#b45309'} strokeWidth="0.4" strokeDasharray="1.5 1" />
                      </g>
                    );
                  }))}
                </svg>
              )}
            </div>
            <p className={`rounded-lg p-2.5 text-xs font-medium ${plan.fits ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
              {!plan.valid
                ? 'Vul geldige maten en aantallen in.'
                : plan.fits
                  ? `${perSheet} op een vel van ${settings.sheetWidthMm} × ${settings.sheetHeightMm} mm · ${settings.bleedMm} mm afloop${cropMarks ? ' · met snijlijnen' : ''}.`
                  : `Past niet: nodig is ${(plan.blockWidthMm + 2 * plan.marginNeededMm).toFixed(0)} × ${(plan.blockHeightMm + 2 * plan.marginNeededMm).toFixed(0)} mm. Op dit vel passen maximaal ${plan.maxColumns} × ${plan.maxRows}.`}
            </p>
            {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-medium text-rose-800">{error}</p>}
            <button type="button" disabled={busy || !plan.fits} onClick={download} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#e31c24] px-3 py-2.5 text-xs font-bold text-white hover:bg-[#b8141a] disabled:cursor-not-allowed disabled:opacity-50">
              <Download className="h-4 w-4" /> {busy ? 'Pdf wordt gemaakt…' : 'Ingeslagen pdf downloaden'}
            </button>
            <p className="text-[10px] leading-snug text-slate-500">Het bestand wordt per exemplaar vullend geplaatst tot in de afloop. Een pdf met meerdere pagina's geeft één vel per pagina.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
