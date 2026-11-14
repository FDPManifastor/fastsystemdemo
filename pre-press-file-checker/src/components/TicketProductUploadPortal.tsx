import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { CheckCircle, FileUp, LoaderCircle } from 'lucide-react';

interface TicketProductUpload {
  id: string;
  description: string;
  quantity: number;
  widthMm: number;
  heightMm: number;
  printSides: 'single' | 'double';
}

interface UploadedCustomerFile {
  id: string;
  fileName: string;
  size: number;
  uploadedAt: string;
}

interface TicketProductUploadPortalProps {
  token: string;
  orderNumber: string;
  product: TicketProductUpload;
  files: UploadedCustomerFile[];
  onUploadComplete: () => void;
}

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

function getFileType(file: File) {
  if (ALLOWED_TYPES.includes(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return '';
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Het bestand kon niet worden gelezen.'));
    reader.onerror = () => reject(new Error('Het bestand kon niet worden gelezen.'));
    reader.readAsDataURL(file);
  });
}

export default function TicketProductUploadPortal({
  token,
  orderNumber,
  product,
  files,
  onUploadComplete,
}: TicketProductUploadPortalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setError('');
    setSuccess('');
    if (!selected) {
      setFile(null);
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('Bestanden mogen maximaal 4 MB groot zijn.');
      event.target.value = '';
      return;
    }
    if (!getFileType(selected)) {
      setFile(null);
      setError('Upload een PDF-, PNG- of JPG-bestand.');
      event.target.value = '';
      return;
    }
    setFile(selected);
  };

  const uploadFile = async () => {
    if (!file) return;
    setIsUploading(true);
    setError('');
    setSuccess('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const response = await fetch(`/api/public/orders/${encodeURIComponent(token)}/product-files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: {
            fileName: file.name,
            fileType: getFileType(file),
            dataUrl,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Het bestand kon niet worden opgeslagen.');
        return;
      }
      setFile(null);
      setSuccess('Bestand ontvangen en gekoppeld aan dit product.');
      onUploadComplete();
    } catch (uploadError) {
      console.error('Productbestand kon niet worden geüpload:', uploadError);
      setError('Er kon geen verbinding worden gemaakt met het uploadsysteem. Probeer het opnieuw.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 font-sans text-slate-900 sm:py-14">
      <main className="mx-auto max-w-2xl space-y-6">
        <header className="rounded-2xl bg-slate-900 p-6 text-white shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-rose-300">FD Printing Center · Bestandsaanlevering</p>
          <h1 className="mt-2 text-2xl font-extrabold">Upload voor {product.description}</h1>
          <p className="mt-2 text-sm text-slate-300">
            Opdrachtbon {orderNumber} · {product.quantity} stuks · {product.widthMm} × {product.heightMm} mm · {product.printSides === 'double' ? 'Dubbelzijdig' : 'Enkelzijdig'}
          </p>
        </header>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-bold">Drukbestand aanleveren</h2>
            <p className="mt-1 text-sm text-slate-500">Dit bestand wordt rechtstreeks aan <strong>{product.description}</strong> gekoppeld. PDF, PNG of JPG · maximaal 4 MB per bestand.</p>
          </div>

          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center hover:border-rose-400 hover:bg-rose-50/40">
            <FileUp className="h-8 w-8 text-rose-700" />
            <span className="text-sm font-bold text-slate-800">{file ? file.name : 'Kies het drukbestand voor dit product'}</span>
            <span className="text-xs text-slate-500">PDF, PNG of JPG</span>
            <input type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" onChange={handleFileChange} className="sr-only" />
          </label>

          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">{error}</p>}
          {success && <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800"><CheckCircle className="h-4 w-4" />{success}</p>}

          <button type="button" disabled={!file || isUploading} onClick={uploadFile} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-5 py-3 text-sm font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50">
            {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {isUploading ? 'Bestand uploaden…' : 'Bestand uploaden'}
          </button>
        </section>

        {files.length > 0 && (
          <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
            <h2 className="font-bold text-slate-900">Bestanden ontvangen voor dit product</h2>
            <ul className="mt-3 space-y-2">
              {files.map((uploadedFile) => (
                <li key={uploadedFile.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-slate-700">
                  <span className="break-all font-semibold">{uploadedFile.fileName}</span>
                  <span className="text-xs text-slate-500">{(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB · {new Date(uploadedFile.uploadedAt).toLocaleString('nl-NL')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
