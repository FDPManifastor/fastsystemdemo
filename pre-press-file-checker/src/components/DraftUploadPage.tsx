import React, { useEffect, useState } from 'react';
import { CheckCircle, Paperclip, Upload } from 'lucide-react';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, getUploadFileType, readFileAsDataUrl } from './ticket/TicketTools';

interface DraftInfo {
  description: string;
  widthMm: number | null;
  heightMm: number | null;
  expiresAt: number;
  file: { fileName: string } | null;
}

/** Telefoonpagina achter de QR-code op een opdrachtbon die nog wordt gemaakt: bestand kiezen en doorsturen naar de balie. */
export default function DraftUploadPage() {
  const token = new URLSearchParams(window.location.search).get('draft') ?? '';
  const [info, setInfo] = useState<DraftInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');

  useEffect(() => {
    document.title = 'Bestand aanleveren · FD Printing Center';
    fetch(`/api/public/ticket-drafts/${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Deze uploadlink is verlopen of bestaat niet.');
        setInfo(await response.json());
      })
      .catch((reason) => setLoadError(reason instanceof Error ? reason.message : 'De uploadlink kon niet worden geladen.'));
  }, [token]);

  const choose = (selected: File | null) => {
    setError('');
    setSent('');
    if (!selected) return setFile(null);
    if (selected.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      return setError(`Bestanden mogen maximaal ${MAX_UPLOAD_LABEL} groot zijn.`);
    }
    if (!getUploadFileType(selected)) {
      setFile(null);
      return setError('Kies een PDF-, PNG- of JPG-bestand.');
    }
    setFile(selected);
  };

  const send = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const response = await fetch(`/api/public/ticket-drafts/${encodeURIComponent(token)}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: { fileName: file.name, fileType: getUploadFileType(file), dataUrl } }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Versturen mislukt. Probeer het opnieuw.');
      setSent(file.name);
      setFile(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Versturen mislukt. Probeer het opnieuw.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 bg-white p-5 font-sans text-slate-900">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#e31c24]">FD Printing Center</p>
      <h1 className="text-xl font-extrabold">Bestand aanleveren</h1>
      {loadError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{loadError}</p>}
      {info && (
        <>
          <p className="text-sm text-slate-600">
            Uw bestand gaat direct naar de balie voor <strong>{info.description || 'uw product'}</strong>
            {info.widthMm && info.heightMm ? ` (${info.widthMm} × ${info.heightMm} mm)` : ''}. Wij controleren en zetten het op maat.
          </p>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <Paperclip className="h-5 w-5" /> {file ? file.name : 'Kies een bestand'}
            <input type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" className="sr-only" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
          </label>
          <p className="text-xs text-slate-500">PDF, PNG of JPG · maximaal {MAX_UPLOAD_LABEL}</p>
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          {sent && <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900"><CheckCircle className="h-4 w-4" /> {sent} is verstuurd naar de balie.</p>}
          <button type="button" disabled={!file || busy} onClick={send} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#e31c24] px-4 py-3 text-sm font-bold text-white hover:bg-[#b8141a] disabled:opacity-50">
            <Upload className="h-4 w-4" /> {busy ? 'Bezig met versturen…' : 'Versturen'}
          </button>
        </>
      )}
    </main>
  );
}
