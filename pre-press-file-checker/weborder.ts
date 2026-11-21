/**
 * Leest een WooCommerce-bestelmail ("Je hebt een nieuwe bestelling: #1234") uit
 * en zet hem om naar de velden van een opdrachtbon in FD Werkplaats.
 *
 * n8n stuurt de mail door naar POST /api/integrations/weborders, samen met het
 * filiaal dat de n8n-sorteerder heeft gekozen.
 */

export type WeborderLine = {
  name: string;
  options: string[];
  quantity: number;
  total: number;
};

export type ParsedWeborder = {
  orderNumber: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  company: string;
  address: string;
  postcodeCity: string;
  shippingAddress: string;
  lines: WeborderLine[];
  total: number;
  vat: number;
  shipping: string;
  paymentMethod: string;
  paid: boolean;
  customerNote: string;
  adminUrl: string;
};

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", times: "×",
};

function decodeEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const num = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** HTML naar platte tekst; <br> wordt een nieuwe regel. */
function toText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/[ \t\r\f\v]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** "€49,95" of "1.234,50" -> 49.95 / 1234.5 */
export function parseEuro(value: string): number {
  const match = /(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/.exec(value.replace(/\s/g, ""));
  if (!match) return 0;
  const whole = match[1].replace(/\./g, "");
  return Math.round(Number(`${whole}.${match[2] || "0"}`) * 100) / 100;
}

/** Inhoud van het eerste element met deze class (werkt ook bij geneste tags van hetzelfde type). */
function blockByClass(html: string, className: string, from = 0): { inner: string; end: number } | null {
  const open = new RegExp(`<([a-z0-9]+)[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, "gi");
  open.lastIndex = from;
  const start = open.exec(html);
  if (!start) return null;
  const tag = start[1].toLowerCase();
  const tagPattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = start.index + start[0].length;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return { inner: html.slice(start.index + start[0].length, match.index), end: tagPattern.lastIndex };
  }
  return null;
}

function allBlocksByClass(html: string, className: string) {
  const blocks: string[] = [];
  let from = 0;
  for (let i = 0; i < 200; i++) {
    const block = blockByClass(html, className, from);
    if (!block) break;
    blocks.push(block.inner);
    from = block.end;
  }
  return blocks;
}

function cells(rowHtml: string) {
  return [...rowHtml.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => m[1]);
}

/** Rij uit de totalen-tabel, bv. order-totals-shipping -> [label, waarde]. */
function totalsRow(html: string, key: string): [string, string] | null {
  const row = blockByClass(html, `order-totals-${key}`);
  if (!row) return null;
  const [label = "", value = ""] = cells(row.inner);
  return [oneLine(toText(label)), oneLine(toText(value))];
}

function addressBlock(html: string, title: RegExp): string[] {
  const titleMatch = title.exec(html);
  if (!titleMatch) return [];
  const rest = html.slice(titleMatch.index);
  const address = /<address\b[^>]*>([\s\S]*?)<\/address>/i.exec(rest);
  if (!address) return [];
  return toText(address[1].replace(/<div[^>]*address-email[\s\S]*?<\/div>/i, "").replace(/<a\b[^>]*href="tel:[\s\S]*?<\/a>/i, ""))
    .split("\n")
    .map(oneLine)
    .filter(Boolean);
}

export function parseWeborderEmail(html: string, subject = ""): ParsedWeborder | null {
  if (typeof html !== "string" || !html) return null;
  const text = toText(html);
  const numberMatch =
    /nieuwe bestelling[^#\d]*#?\s*(\d{2,})/i.exec(subject) ||
    /Nieuwe bestelling:\s*nr\.?\s*(\d{2,})/i.exec(text) ||
    /Bestelling\s*#(\d{2,})/i.exec(text);
  if (!numberMatch) return null;

  const lines: WeborderLine[] = allBlocksByClass(html, "order_item").map((row) => {
    const nameBlock = blockByClass(row, "wc-product-name");
    const metaBlock = blockByClass(row, "email-order-item-meta");
    const name = oneLine(toText(nameBlock?.inner || "")) || "Webshopproduct";
    const options = metaBlock ? toText(metaBlock.inner).split("\n").map(oneLine).filter(Boolean) : [];
    const qtyMatch = /×\s*(\d+)/.exec(toText(row));
    // Laatste bedrag in de rij is het regeltotaal (bij korting staat de oude prijs ervoor).
    const amounts = allBlocksByClass(row, "woocommerce-Price-amount").map((inner) => parseEuro(toText(inner)));
    const total = amounts.length ? amounts[amounts.length - 1] : 0;
    return { name, options, quantity: Math.max(1, Number(qtyMatch?.[1] || 1)), total };
  });

  const totalRow = totalsRow(html, "total");
  const vatMatch = totalRow ? /inclusief\s*€?\s*([\d.,]+)\s*btw/i.exec(totalRow[1]) : null;
  const shippingRow = totalsRow(html, "shipping");
  const paymentRow = totalsRow(html, "payment_method");
  const noteRow = totalsRow(html, "customer_note");

  const billing = addressBlock(html, /address-title[^>]*>\s*Factuuradres/i);
  const shippingLines = addressBlock(html, /address-title[^>]*>\s*Verzendadres/i);
  const emailMatch = /address-email[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  const phoneMatch = /href="tel:([^"]+)"/i.exec(html);
  const nameMatch = /nieuwe bestelling ontvangen van\s+([^:\n]+):/i.exec(text);
  const adminMatch = /wp-admin%2Fpost\.php%3Fpost=(\d+)/i.exec(html) || /wp-admin\/post\.php\?post=(\d+)/i.exec(html);

  const postcodeIndex = billing.findIndex((line) => /\b\d{4}\s?[A-Z]{2}\b/i.test(line));
  const clientName = oneLine(nameMatch?.[1] || "") || billing.find((line) => line.length > 1) || "Webshopklant";
  const nameIndex = billing.findIndex((line) => line.toLowerCase() === clientName.toLowerCase());
  const company = nameIndex > 0 ? billing.slice(0, nameIndex).join(", ") : "";
  const streetLines = postcodeIndex > -1 ? billing.slice(nameIndex > -1 ? nameIndex + 1 : 0, postcodeIndex) : [];

  return {
    orderNumber: numberMatch[1],
    clientName,
    clientEmail: oneLine(toText(emailMatch?.[1] || "")).toLowerCase(),
    clientPhone: phoneMatch ? decodeURIComponent(phoneMatch[1]) : "",
    company,
    address: streetLines.join(", "),
    postcodeCity: postcodeIndex > -1 ? billing[postcodeIndex] : "",
    shippingAddress: shippingLines.join(", "),
    lines,
    total: totalRow ? parseEuro(totalRow[1].split("(")[0]) : lines.reduce((sum, line) => sum + line.total, 0),
    vat: vatMatch ? parseEuro(vatMatch[1]) : 0,
    shipping: shippingRow ? shippingRow[1] || shippingRow[0].replace(/^Verzending:\s*/i, "") : "",
    paymentMethod: paymentRow ? paymentRow[1] : "",
    paid: /Betaling afgerond/i.test(text),
    customerNote: noteRow ? noteRow[1] : "",
    adminUrl: adminMatch ? `https://www.fdprintingcenter.nl/wp-admin/post.php?post=${adminMatch[1]}&action=edit` : "",
  };
}

const PAPER_SIZES: Record<string, [number, number]> = {
  A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297], A5: [148, 210], A6: [105, 148], A7: [74, 105],
};

/** Formaat uit naam/opties halen: A0–A7, "50x70 cm" of "500 x 700 mm". */
export function detectSize(text: string): [number, number] | null {
  const paper = /\bA([0-7])\b/i.exec(text);
  if (paper) return PAPER_SIZES[`A${paper[1]}`];
  const dims = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/i.exec(text);
  if (dims) {
    const factor = dims[3].toLowerCase() === "cm" ? 10 : dims[3].toLowerCase() === "m" ? 1000 : 1;
    const w = Math.round(Number(dims[1].replace(",", ".")) * factor);
    const h = Math.round(Number(dims[2].replace(",", ".")) * factor);
    if (w > 0 && h > 0 && w <= 100000 && h <= 100000) return [w, h];
  }
  return null;
}
