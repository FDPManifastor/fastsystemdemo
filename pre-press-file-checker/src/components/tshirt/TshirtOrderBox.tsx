import React, { useMemo } from 'react';
import { Shirt } from 'lucide-react';
import { TSHIRT_COLORS, TSHIRT_FORMATS, TshirtDesign, TshirtSide, TshirtSpec, formatForSize, sizesSummary } from '../../utils/tshirtPricing';
import { TshirtCanvas } from './TshirtMockup';

const money = (value: number) => `€ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const cm = (mm: number) => (mm / 10).toLocaleString('nl-NL', { maximumFractionDigits: 1 });

type StoredDesign = TshirtDesign & { dpi?: number; check?: string; checkNotes?: string[] };

/** T-shirtgegevens bij een online bestelling in het backoffice: kleur, maten, opdrukken, prijs en proefbeeld. */
export function TshirtOrderBox({ order }: { order: Record<string, any> }) {
  const data = useMemo(() => {
    try {
      return JSON.parse(String(order.tshirt_json)) as { spec: TshirtSpec; designs?: StoredDesign[]; total: number; perShirt: number };
    } catch {
      return null;
    }
  }, [order.tshirt_json]);
  if (!data?.spec) return null;
  const { spec } = data;
  const designs = Array.isArray(data.designs) ? data.designs : [];
  const fileUrl = (fileId?: string) => (fileId ? `/api/orders/${encodeURIComponent(order.id)}/files/${encodeURIComponent(fileId)}` : undefined);
  const files: Record<string, string> = order.tshirt_files || {};
  const proofs: Record<string, string> = order.tshirt_proofs || {};
  const sides = (['voor', 'achter'] as TshirtSide[]).filter((side) => designs.some((design) => design.side === side));

  return (
    <div className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/50 p-3">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-sky-800"><Shirt className="h-3.5 w-3.5" /> T-shirt DTF</span>
      <p className="font-extrabold text-slate-800">{TSHIRT_COLORS[spec.color]?.name} korte mouw · {sizesSummary(spec.sizes)}</p>
      <ol className="space-y-1 text-slate-700">
        {designs.map((design, index) => {
          const format = formatForSize(design.widthMm, design.heightMm);
          return (
            <li key={design.id} className="leading-snug">
              <strong>{index + 1}. {design.side === 'voor' ? 'Voorkant' : 'Achterkant'}</strong> · {cm(design.widthMm)} × {cm(design.heightMm)} cm{format ? ` (${TSHIRT_FORMATS[format].short})` : ''}
              {' '}· {cm(Math.abs(design.xMm))} cm {design.xMm < -5 ? 'rechts (drager)' : design.xMm > 5 ? 'links (drager)' : 'midden'}, {cm(design.yMm - design.heightMm / 2)} cm onder kraag
              {design.dpi ? ` · ${design.dpi} dpi` : ''}
              {design.check && design.check !== 'ok' && <span className={`ml-1 rounded px-1 text-[10px] font-bold ${design.check === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{design.check === 'error' ? 'controle nodig' : 'let op'}</span>}
              {files[design.id] && <a href={fileUrl(files[design.id])} className="ml-1 text-[11px] font-bold text-sky-700 underline">Bestand</a>}
              {Array.isArray(design.checkNotes) && design.checkNotes.length > 0 && <span className="block text-[10px] text-slate-500">{design.checkNotes.join(' ')}</span>}
            </li>
          );
        })}
      </ol>
      {spec.designFee && <p className="text-[11px] font-semibold text-slate-700">Klant wil het ontwerp laten opmaken (opmaakkosten).</p>}
      <p className="text-slate-700">Totaal <strong>{money(data.total)}</strong> incl. btw ({money(data.perShirt)} per shirt)</p>
      <div className="grid grid-cols-2 gap-2">
        {sides.map((side) => (
          <figure key={side} className="rounded-lg bg-white p-1">
            {proofs[side] ? (
              <a href={fileUrl(proofs[side])}><img src={fileUrl(proofs[side])} alt={`Proef ${side === 'voor' ? 'voorkant' : 'achterkant'}`} className="w-full" /></a>
            ) : (
              <TshirtCanvas color={spec.color} side={side} designs={designs.filter((design) => design.side === side).map((design) => ({ ...design, url: fileUrl(files[design.id]) }))} className="w-full" />
            )}
            <figcaption className="text-center text-[10px] font-bold text-slate-500">Proef {side === 'voor' ? 'voorkant' : 'achterkant'}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
