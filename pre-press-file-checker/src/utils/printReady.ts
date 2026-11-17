import { PDFDocument, degrees, popGraphicsState, pushGraphicsState, rectangle, clip, endPath, rgb } from 'pdf-lib';

/** Hoe het ontwerp in het vak (eindformaat + afloop) wordt geplaatst. */
export type PrintReadyFit = 'fit' | 'fill' | 'stretch';

export interface PrintReadyOptions {
  trimWidthMm: number;
  trimHeightMm: number;
  bleedMm: number;
  fit: PrintReadyFit;
  /** Kloksgewijs, veelvoud van 90. */
  rotation: number;
}

const MM = 72 / 25.4;

/**
 * Maakt van een afbeelding (png/jpg) of pagina 1 van een pdf één pdf-pagina op exact
 * eindformaat + afloop rondom, klaar om in te slaan.
 */
export async function buildPrintReadyPdf(source: Uint8Array, fileType: string, options: PrintReadyOptions): Promise<Uint8Array> {
  const { trimWidthMm, trimHeightMm, bleedMm, fit } = options;
  if (![trimWidthMm, trimHeightMm].every((value) => Number.isFinite(value) && value > 0) || !Number.isFinite(bleedMm) || bleedMm < 0) {
    throw new Error('Het formaat of de afloop is ongeldig.');
  }
  const rotation = ((Math.round(options.rotation / 90) * 90) % 360 + 360) % 360;
  const pageW = (trimWidthMm + 2 * bleedMm) * MM;
  const pageH = (trimHeightMm + 2 * bleedMm) * MM;

  const output = await PDFDocument.create();
  let artW: number;
  let artH: number;
  let draw: (x: number, y: number, width: number, height: number, angle: number) => void;
  const page = output.addPage([pageW, pageH]);

  if (fileType === 'application/pdf') {
    const sourceDocument = await PDFDocument.load(source, { ignoreEncryption: true });
    if (sourceDocument.getPageCount() === 0) throw new Error("Het bestand bevat geen pagina's.");
    const [embedded] = await output.embedPdf(sourceDocument, [0]);
    artW = embedded.width;
    artH = embedded.height;
    draw = (x, y, width, height, angle) => page.drawPage(embedded, { x, y, width, height, rotate: degrees(angle) });
  } else {
    const image = fileType === 'image/png' ? await output.embedPng(source) : await output.embedJpg(source);
    artW = image.width;
    artH = image.height;
    draw = (x, y, width, height, angle) => page.drawImage(image, { x, y, width, height, rotate: degrees(angle) });
  }

  // Afmetingen na draaien: bij 90°/270° wisselen breedte en hoogte.
  const swapped = rotation === 90 || rotation === 270;
  const effW = swapped ? artH : artW;
  const effH = swapped ? artW : artH;
  let boxW: number;
  let boxH: number;
  if (fit === 'stretch') {
    boxW = pageW;
    boxH = pageH;
  } else {
    const scale = fit === 'fill' ? Math.max(pageW / effW, pageH / effH) : Math.min(pageW / effW, pageH / effH);
    boxW = effW * scale;
    boxH = effH * scale;
  }
  // Ongedraaide tekenafmetingen die na de draaiing precies boxW × boxH vullen.
  const drawW = swapped ? boxH : boxW;
  const drawH = swapped ? boxW : boxH;
  // pdf-lib draait tegen de klok in om (x, y); wij draaien met de klok.
  const angle = -rotation;
  const rad = (angle * Math.PI) / 180;
  const cx = pageW / 2;
  const cy = pageH / 2;
  const offsetX = (drawW / 2) * Math.cos(rad) - (drawH / 2) * Math.sin(rad);
  const offsetY = (drawW / 2) * Math.sin(rad) + (drawH / 2) * Math.cos(rad);

  page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: rgb(1, 1, 1) });
  page.pushOperators(pushGraphicsState(), rectangle(0, 0, pageW, pageH), clip(), endPath());
  draw(cx - offsetX, cy - offsetY, drawW, drawH, angle);
  page.pushOperators(popGraphicsState());

  // Eindformaat vastleggen voor drukkerij-software (TrimBox/BleedBox).
  const bleed = bleedMm * MM;
  page.setTrimBox(bleed, bleed, pageW - 2 * bleed, pageH - 2 * bleed);
  page.setBleedBox(0, 0, pageW, pageH);
  output.setTitle('Printklaar bestand');
  output.setProducer('FD Printing Center');
  return output.save();
}
