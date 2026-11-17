import { BRANCH_DETAILS } from './branches';

type AnyOrder = Record<string, any>;
type FileEntry = { path: string; data: Uint8Array };

const clean = (value: string, max = 60) =>
  value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || 'naamloos';

const euro = (value: unknown) => `EUR ${Number(value || 0).toFixed(2).replace('.', ',')}`;

/** Eenvoudige PDF van de opdrachtbon (of online opdracht) met alle gegevens. */
async function buildOrderPdf(order: AnyOrder): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const branch = BRANCH_DETAILS[String(order.branch || 'Amsterdam')] ? String(order.branch || 'Amsterdam') : 'Amsterdam';
  const details = BRANCH_DETAILS[branch];
  const left = 15;
  let y = 18;
  const line = (text: string, size = 10, bold = false, gap = 5.5) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    const wrapped = doc.splitTextToSize(text, 180) as string[];
    for (const part of wrapped) {
      if (y > 280) { doc.addPage(); y = 18; }
      doc.text(part, left, y);
      y += gap;
    }
  };

  line('FD Printing Center', 18, true, 8);
  line(`Opdrachtbon ${order.order_number || order.id}`, 14, true, 8);
  line(`Datum: ${new Date(order.createdAt || Date.now()).toLocaleDateString('nl-NL')}   Filiaal: ${branch}   Status: ${order.status || 'Ingediend'}`);
  y += 2;

  line('Klant', 11, true);
  line(String(order.contact_person || order.clientName || ''));
  if (order.contact_person && order.clientName && order.contact_person !== order.clientName) line(String(order.clientName));
  if (order.client_address) line(String(order.client_address));
  if (order.client_postcode_city) line(String(order.client_postcode_city));
  if (order.clientPhone) line(`Tel: ${order.clientPhone}`);
  if (order.clientEmail) line(`E-mail: ${order.clientEmail}`);
  if (order.clientReference) line(`Referentie: ${order.clientReference}`);
  y += 2;

  line('Levering', 11, true);
  line(`Leverdatum: ${order.delivery_date || '-'}   Methode: ${order.delivery_method || '-'}`);
  if (order.delivery_address) line(`Adres: ${order.delivery_address}`);
  if (order.assisted_by) line(`Geholpen door: ${order.assisted_by}`);
  y += 2;

  line('Producten', 11, true);
  let lines: any[] = [];
  if (order.order_type === 'opdrachtbon') {
    try { lines = JSON.parse(order.products_json || '[]'); } catch { lines = []; }
  } else {
    lines = [{
      description: `${order.selectedProductName || 'Product'}${order.customWidth ? ` (${order.customWidth} x ${order.customHeight} mm)` : ''}`,
      quantity: order.clientQuantity || 1,
    }];
  }
  for (const item of lines) {
    const price = item.fixedTotal !== undefined ? ` - ${euro(item.fixedTotal)}` : item.unitPrice ? ` - ${euro(Number(item.unitPrice) * Number(item.quantity || 1))}` : '';
    line(`- ${item.quantity || 1} x ${item.description || ''}${price}`);
    if (item.prepressNote) line(`    Prepress: ${item.prepressNote}`, 9);
  }
  y += 2;

  if (order.grand_total !== undefined) {
    line('Bedragen', 11, true);
    line(`Subtotaal: ${euro(order.subtotal)}   BTW: ${euro(order.vat)}   Totaal: ${euro(order.grand_total)}`);
    line(`Betaald/aanbetaling: ${euro(order.prepayment)}   Nog te betalen: ${euro(order.remaining)}   (${order.payment_status || 'Niet betaald'})`);
    y += 2;
  }
  if (order.notes) { line('Opmerkingen', 11, true); line(String(order.notes)); y += 2; }
  if (order.internal_notes) { line('Interne notities', 11, true); line(String(order.internal_notes)); y += 2; }

  y = Math.max(y + 4, 270);
  line(`${details.address} | Tel: ${details.phone} | ${details.email}`, 9);
  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}

/* Minimale ZIP-schrijver (zonder compressie) zodat er geen extra pakket nodig is. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (data: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function buildZip(files: FileEntry[]): Blob {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.path);
    const crc = crc32(file.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, file.data.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, file.data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, dosTime, true);
    entry.setUint16(14, dosDate, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, file.data.length, true);
    entry.setUint32(24, file.data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + file.data.length;
  }
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

export interface SaveResult {
  mode: 'map' | 'zip';
  folderName: string;
  fileCount: number;
  failed: string[];
}

/**
 * Bewaart de opdracht als map op de computer: Opdrachtbon.pdf + submap Bestanden met alle aangeleverde bestanden.
 * Chrome/Edge: er wordt een map gekozen en daarin wordt de opdrachtmap aangemaakt. Andere browsers (zoals Safari op iPad): ZIP-download.
 */
export async function saveOrderToComputer(order: AnyOrder, includeFiles: boolean): Promise<SaveResult | null> {
  const folderName = clean(`${order.order_number || order.id} - ${order.contact_person || order.clientName || 'klant'}`, 80);
  const entries: FileEntry[] = [{ path: 'Opdrachtbon.pdf', data: await buildOrderPdf(order) }];
  const failed: string[] = [];
  const used = new Set<string>();
  if (includeFiles && Array.isArray(order.customerFiles)) {
    for (const file of order.customerFiles) {
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/files/${encodeURIComponent(file.id)}`, { credentials: 'include' });
        if (!response.ok) throw new Error(String(response.status));
        let name = clean(String(file.fileName || file.id), 120);
        if (used.has(name)) name = `${file.id.slice(0, 6)}-${name}`;
        used.add(name);
        entries.push({ path: `Bestanden/${name}`, data: new Uint8Array(await response.arrayBuffer()) });
      } catch {
        failed.push(String(file.fileName || file.id));
      }
    }
  }

  if (order.extraInfo) {
    entries.push({ path: 'Extra info.txt', data: new TextEncoder().encode(String(order.extraInfo)) });
  }
  if (includeFiles && Array.isArray(order.extraFiles)) {
    for (const file of order.extraFiles) {
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/files/${encodeURIComponent(file.id)}`, { credentials: 'include' });
        if (!response.ok) throw new Error(String(response.status));
        let name = clean(String(file.fileName || file.id), 120);
        if (used.has(`extra/${name}`)) name = `${file.id.slice(0, 6)}-${name}`;
        used.add(`extra/${name}`);
        entries.push({ path: `Extra bijlagen/${name}`, data: new Uint8Array(await response.arrayBuffer()) });
      } catch {
        failed.push(String(file.fileName || file.id));
      }
    }
  }

  const picker = (window as any).showDirectoryPicker as undefined | ((options?: any) => Promise<any>);
  if (picker) {
    let root: any;
    try {
      root = await picker({ mode: 'readwrite' });
    } catch {
      return null; // geannuleerd
    }
    const folder = await root.getDirectoryHandle(folderName, { create: true });
    for (const entry of entries) {
      const parts = entry.path.split('/');
      let dir = folder;
      for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
      const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const writable = await handle.createWritable();
      await writable.write(entry.data);
      await writable.close();
    }
    return { mode: 'map', folderName, fileCount: entries.length, failed };
  }

  const zip = buildZip(entries.map((entry) => ({ path: `${folderName}/${entry.path}`, data: entry.data })));
  const url = URL.createObjectURL(zip);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${folderName}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { mode: 'zip', folderName, fileCount: entries.length, failed };
}
