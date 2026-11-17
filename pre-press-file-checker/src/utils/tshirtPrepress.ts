/**
 * Pre-press check voor textiel (DTF).
 * Controleert resolutie op de echte printmaat, achtergrond (transparantie) en contrast met de shirtkleur.
 */
import type { TshirtColor } from './tshirtPricing';

/** De server accepteert afbeeldingen tot 6 MB per kant. */
export const TSHIRT_MAX_FILE_BYTES = 6 * 1024 * 1024;

export interface TshirtImage {
  fileName: string;
  fileType: 'image/png' | 'image/jpeg';
  dataUrl: string;
  pixelWidth: number;
  pixelHeight: number;
  /** Heeft de afbeelding (deels) transparante pixels? */
  hasTransparency: boolean;
  /** Gemiddelde helderheid (0–255) van de zichtbare pixels. */
  averageLuminance: number;
}

export type CheckLevel = 'ok' | 'warning' | 'error';
export interface CheckItem {
  level: CheckLevel;
  text: string;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Het bestand kon niet worden gelezen.'));
    reader.readAsDataURL(file);
  });
}

async function detectType(file: File): Promise<'image/png' | 'image/jpeg' | null> {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

export async function loadTshirtImage(file: File): Promise<TshirtImage> {
  const fileType = await detectType(file);
  if (!fileType) throw new Error('Alleen PNG- of JPG-afbeeldingen zijn mogelijk.');
  if (file.size > TSHIRT_MAX_FILE_BYTES) throw new Error('Het bestand is groter dan 6 MB. Maak het kleiner of lever het aan in de winkel.');
  const rawUrl = await readAsDataUrl(file);
  // Zorg dat het mime-type in de data-URL klopt met de inhoud.
  const dataUrl = rawUrl.replace(/^data:[^;,]*/, `data:${fileType}`);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('De afbeelding kon niet worden geladen.'));
    image.src = dataUrl;
  });

  // Steekproef op een kleine versie voor transparantie en helderheid.
  const sample = 160;
  const ratio = Math.min(1, sample / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let hasTransparency = false;
  let averageLuminance = 128;
  if (context) {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let transparent = 0;
    let luminanceSum = 0;
    let visible = 0;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3];
      if (alpha < 250) transparent += 1;
      if (alpha > 40) {
        luminanceSum += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
        visible += 1;
      }
    }
    hasTransparency = transparent > (data.length / 4) * 0.01;
    averageLuminance = visible ? luminanceSum / visible : 128;
  }

  return { fileName: file.name, fileType, dataUrl, pixelWidth: image.naturalWidth, pixelHeight: image.naturalHeight, hasTransparency, averageLuminance };
}

/** Effectieve resolutie (dpi) op de printmaat. */
export function effectiveDpi(image: Pick<TshirtImage, 'pixelWidth'>, printedWidthMm: number) {
  if (!(printedWidthMm > 0)) return 0;
  return Math.round(image.pixelWidth / (printedWidthMm / 25.4));
}

export function checkTshirtImage(image: TshirtImage, printed: { widthMm: number; heightMm: number }, color: TshirtColor): CheckItem[] {
  const items: CheckItem[] = [];
  const dpi = effectiveDpi(image, printed.widthMm);
  const size = `${Math.round(printed.widthMm / 10)} × ${Math.round(printed.heightMm / 10)} cm`;
  if (dpi >= 200) items.push({ level: 'ok', text: `Scherp genoeg: ${dpi} dpi op ${size}.` });
  else if (dpi >= 120) items.push({ level: 'warning', text: `Resolutie ${dpi} dpi op ${size}. Dat is bruikbaar, maar 200 dpi of meer wordt scherper.` });
  else items.push({ level: 'error', text: `Te lage resolutie: ${dpi} dpi op ${size}. De print wordt korrelig. Upload een grotere afbeelding of maak het ontwerp kleiner.` });

  if (image.fileType === 'image/jpeg') {
    items.push({ level: 'warning', text: 'JPG heeft geen transparante achtergrond: het hele vlak (ook wit of gekleurd) wordt meegedrukt. Gebruik bij voorkeur een PNG zonder achtergrond.' });
  } else if (!image.hasTransparency) {
    items.push({ level: 'warning', text: 'Deze PNG heeft geen transparante achtergrond: het hele rechthoekige vlak wordt meegedrukt.' });
  } else {
    items.push({ level: 'ok', text: 'Transparante achtergrond: alleen het ontwerp wordt gedrukt.' });
  }

  if (color === 'zwart' && image.averageLuminance < 45) {
    items.push({ level: 'warning', text: 'Het ontwerp is erg donker en valt weg op een zwart shirt.' });
  } else if (color === 'wit' && image.averageLuminance > 230) {
    items.push({ level: 'warning', text: 'Het ontwerp is erg licht en valt weg op een wit shirt.' });
  }
  return items;
}

export function worstLevel(items: CheckItem[]): CheckLevel {
  if (items.some((item) => item.level === 'error')) return 'error';
  if (items.some((item) => item.level === 'warning')) return 'warning';
  return 'ok';
}
