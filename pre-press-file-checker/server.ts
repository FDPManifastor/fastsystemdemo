import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { createStorage, type NewFile, type Order } from "./storage";
import { createCatalog } from "./catalog";
import { createProjectMap } from "./projectMap";
import { calculateTshirtPrice, parseTshirtDesigns, parseTshirtSpec, printsFromDesigns } from "./src/utils/tshirtPricing";

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const MAX_CUSTOMER_FILE_BYTES = 20 * 1024 * 1024;
const AUTH_RATE_LIMIT_MAX_REQUESTS = 20;

const storage = createStorage();
const catalog = createCatalog(storage);
const projectMap = createProjectMap();
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: express.Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function parseCookies(rawCookieHeader: string | undefined) {
  const cookies: Record<string, string> = {};
  if (!rawCookieHeader) return cookies;

  rawCookieHeader.split(";").forEach((entry) => {
    const [name, ...rest] = entry.trim().split("=");
    if (!name) return;
    try {
      cookies[name] = decodeURIComponent(rest.join("=") || "");
    } catch {
      cookies[name] = "";
    }
  });

  return cookies;
}

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function throttled(req: express.Request, res: express.Response, next: express.NextFunction, maxRequests: number) {
  const key = getClientIp(req);
  const now = Date.now();
  const existing = rateLimitMap.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > existing.resetAt) {
    existing.count = 0;
    existing.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  existing.count += 1;
  rateLimitMap.set(key, existing);
  if (rateLimitMap.size > 10000) {
    for (const [ip, entry] of rateLimitMap) {
      if (entry.resetAt <= now) rateLimitMap.delete(ip);
    }
  }

  if (existing.count > maxRequests) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  return next();
}

function rateLimit(maxRequests: number): express.RequestHandler {
  return (req, res, next) => throttled(req, res, next, maxRequests);
}

function requireSameOrigin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const origin = req.get("origin");
  const configuredOrigin = process.env.PUBLIC_APP_ORIGIN;
  const expectedOrigin = configuredOrigin
    ? new URL(configuredOrigin).origin
    : `${req.protocol}://${req.get("host")}`;

  if (!origin || origin === "null") {
    return res.status(403).json({ error: "A valid same-origin request is required." });
  }

  try {
    if (new URL(origin).origin !== expectedOrigin) {
      return res.status(403).json({ error: "A valid same-origin request is required." });
    }
  } catch {
    return res.status(403).json({ error: "A valid same-origin request is required." });
  }

  return next();
}

function applySecurityHeaders(req: express.Request, res: express.Response, next: express.NextFunction) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    );
  }
  next();
}

function ensureAdminPasswordConfigured() {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    console.warn("[security] ADMIN_PASSWORD is not configured or is too short. Set ADMIN_PASSWORD in your deployment environment.");
  }
}

type AsyncHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>;

function asyncRoute(handler: AsyncHandler): express.RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

const BRANCHES = ["Amsterdam", "Utrecht", "Hoogvliet"] as const;
const DEFAULT_BRANCH = "Amsterdam";
const isBranch = (value: unknown): value is string => typeof value === "string" && (BRANCHES as readonly string[]).includes(value);

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const STAFF_PERMISSIONS = ["bon_maken", "status_wijzigen", "bon_aanpassen", "betaling", "bestanden", "prepress"] as const;
type StaffPermission = (typeof STAFF_PERMISSIONS)[number];
type SessionInfo = { sessionId: string; role: "admin" | "branch"; branch: string; staffId?: string; staffName?: string; perms: StaffPermission[] | null };
/** Beheerder en filiaal-login (zonder eigen medewerkersaccount) hebben alle rechten; een persoonlijke login alleen de aangevinkte. */
const hasPerm = (info: SessionInfo, perm: StaffPermission) => info.role === "admin" || info.perms === null || info.perms.includes(perm);
const actorName = (info: SessionInfo) => (info.role === "admin" ? "Beheerder" : info.staffName || `Filiaal ${info.branch}`);
const PRE_APPROVAL_STATUSES = ["Ingediend", "Bestanden Ontvangen", "In Controle", "Actie Vereist"];
const cleanNote = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 500) : "");
const cleanBleed = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 20 ? value : undefined);
// "Ik ben ..." in de werkplaats: de naam moet een bestaande medewerker zijn (van het eigen filiaal, of zonder filiaal).
async function resolveActor(info: SessionInfo, actingAs: unknown): Promise<string> {
  if (info.role === "branch" && typeof actingAs === "string" && actingAs.trim()) {
    const member = (await storage.listStaff()).find((item) => item.name === actingAs.trim() && (!item.branch || item.branch === info.branch));
    if (member) return member.name;
  }
  return actorName(info);
}
const denyPerm = (res: express.Response) => res.status(403).json({ error: "U heeft hier geen rechten voor. Vraag de beheerder." });
const parsePerms = (raw: string | null): StaffPermission[] => {
  // Nog niets ingesteld: standaard alle backoffice-rechten (opdrachtbon + opdrachten). De beheerder vinkt af wat niet mag.
  if (!raw) return [...STAFF_PERMISSIONS];
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? STAFF_PERMISSIONS.filter((perm) => list.includes(perm)) : [];
  } catch {
    return [];
  }
};
const sessionStartKey = (sessionId: string) => `sessstart:${crypto.createHash("sha256").update(sessionId).digest("hex")}`;
const sessionRoleKey = (sessionId: string) => `sessrole:${crypto.createHash("sha256").update(sessionId).digest("hex")}`;

async function createAdminSession(role: "admin" | "branch" = "admin", branch = "", staffId = "") {
  const sessionId = crypto.randomBytes(32).toString("hex");
  await storage.createSession(sessionId, Date.now() + ADMIN_SESSION_TTL_MS);
  await storage.setMeta(sessionStartKey(sessionId), String(Date.now()));
  await storage.setMeta(sessionRoleKey(sessionId), role === "admin" ? "admin" : staffId ? `staff:${staffId}` : `branch:${branch}`);
  return sessionId;
}

async function getAdminSession(req: express.Request) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.fd_admin_session;
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return null;

  // Een sessie duurt maximaal 8 uur na het inloggen, ook als er steeds gebruik van wordt gemaakt.
  const started = Number(await storage.getMeta(sessionStartKey(sessionId))) || Date.now();
  const endsAt = started + ADMIN_SESSION_TTL_MS;
  if (Date.now() >= endsAt) {
    await storage.deleteSession(sessionId);
    return null;
  }
  const valid = await storage.touchSession(sessionId, endsAt);
  return valid ? sessionId : null;
}

/** Wie is ingelogd? Alleen een uitdrukkelijk als beheerder aangemaakte sessie is beheerder. */
async function getSessionInfo(req: express.Request): Promise<SessionInfo | null> {
  const sessionId = await getAdminSession(req);
  if (!sessionId) return null;
  const raw = await storage.getMeta(sessionRoleKey(sessionId));
  if (raw && raw.startsWith("branch:") && isBranch(raw.slice(7))) return { sessionId, role: "branch", branch: raw.slice(7), perms: parsePerms(await storage.getMeta(`branchperm:${raw.slice(7)}`)) };
  if (raw && raw.startsWith("staff:")) {
    const staffId = raw.slice(6);
    const member = (await storage.listStaff()).find((item) => item.id === staffId);
    // Verwijderde medewerker of medewerker zonder filiaal: sessie is niet meer geldig.
    if (!member || !isBranch(member.branch)) return null;
    return { sessionId, role: "branch", branch: member.branch, staffId, staffName: member.name, perms: parsePerms(await storage.getMeta(`staffperm:${staffId}`)) };
  }
  // Alleen sessies die uitdrukkelijk als beheerder zijn aangemaakt tellen als beheerder (oude sessies zonder rol niet meer).
  if (raw === "admin") return { sessionId, role: "admin", branch: "", perms: null };
  return null;
}

const orderBranch = (order: any) => (isBranch(order?.branch) ? order.branch : DEFAULT_BRANCH);
/** Beheerder ziet alles; een filiaal ziet eigen orders en orders die met dat filiaal zijn gedeeld. */
const canSeeOrder = (order: any, info: SessionInfo) =>
  info.role === "admin" || orderBranch(order) === info.branch || (Array.isArray(order?.sharedWith) && order.sharedWith.includes(info.branch));
/** Aanpassen, delen en verplaatsen mag alleen de beheerder of het filiaal waar de order thuishoort. */
const canManageOrder = (order: any, info: SessionInfo) => info.role === "admin" || orderBranch(order) === info.branch;

const requireAdmin = asyncRoute(async (req, res, next) => {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    return res.status(503).json({ error: "Admin authentication is not configured." });
  }
  const info = await getSessionInfo(req);
  if (!info) return res.status(401).json({ error: "Not authorized." });
  if (info.role !== "admin") return res.status(403).json({ error: "Alleen de beheerder mag dit." });
  res.locals.session = info;
  return next();
});

/** Elke ingelogde medewerker (beheerder of filiaal). */
const requireStaffSession = asyncRoute(async (req, res, next) => {
  const info = await getSessionInfo(req);
  if (!info) return res.status(401).json({ error: "Not authorized." });
  res.locals.session = info;
  return next();
});

async function startServer() {
  const app = express();

  ensureAdminPasswordConfigured();
  await storage.init();
  console.log(`[storage] Opslag actief: ${storage.kind === "postgres" ? "Postgres-database (DATABASE_URL)" : "lokaal bestand local-data.json"}`);
  app.disable("x-powered-by");
  app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
  app.use(applySecurityHeaders);
  // Bestandsuploads (base64 in json) mogen groter zijn dan gewone verzoeken.
  // Origineel en op maat gezette versie samen (twee bestanden van max. 20 MB).
  app.use("/api/public/orders", express.json({ limit: "64mb" }));
  app.use("/api/public/ticket-drafts", express.json({ limit: "32mb" }));
  app.use("/api/orders/:id/attachments", express.json({ limit: "32mb" }));
  // Online T-shirtbestelling: meerdere opdrukken (max 40 MB samen) in één verzoek.
  const tshirtOrderJson = express.json({ limit: "64mb" });
  app.use((req, res, next) => (req.method === "POST" && req.path === "/api/orders" ? tshirtOrderJson(req, res, next) : next()));
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ limit: "32kb", extended: true }));
  app.use("/api", rateLimit(RATE_LIMIT_MAX_REQUESTS));
  app.use("/api", requireSameOrigin);

  const publicOrderFields = [
    "id",
    "createdAt",
    "status",
    "history",
    "selectedProductName",
    "customWidth",
    "customHeight",
    "printSides",
    "frontFileName",
    "backFileName",
  ];

  function serializeAdminOrder(order: any) {
    const result = { ...order };
    if (Array.isArray(order.customerFiles)) {
      result.customerFiles = order.customerFiles.map(({ dataUrl: _dataUrl, ...file }: any) => file);
    }
    return result;
  }

  function serializePublicOrder(order: any, productUpload?: any) {
    const result: Record<string, unknown> = {};
    publicOrderFields.forEach((field) => {
      if (field in order) result[field] = order[field];
    });
    // Interne notities (wie werkt eraan, delen, verplaatsen, aanpassen) zijn niet voor de klant.
    if (Array.isArray(order.history)) result.history = order.history.filter((entry: any) => !entry?.internal).map(({ by: _by, ...entry }: any) => entry);
    const customerFiles = (Array.isArray(order.customerFiles) ? order.customerFiles : [])
      .filter((file: any) => !productUpload || file.productLineId === productUpload.id);
    result.customerFiles = customerFiles.map((file: any) => ({
      id: file.id,
      fileName: file.fileName,
      fileType: file.fileType,
      size: file.size,
      side: file.side,
      productName: file.productName,
      productQuantity: file.productQuantity,
      uploadedAt: file.uploadedAt
    }));
    if (productUpload) {
      result.orderNumber = order.order_number;
      result.productUpload = {
        id: productUpload.id,
        description: productUpload.description,
        quantity: productUpload.quantity,
        widthMm: productUpload.widthMm,
        heightMm: productUpload.heightMm,
        printSides: productUpload.printSides
      };
      return result;
    }

    result.hasDesignFile = Boolean(order.imageSrcUrl) || Object.keys(order.tshirt_files || {}).length > 0;
    if (order.order_type === "opdrachtbon") {
      let products: any[] = [];
      try {
        products = JSON.parse(String(order.products_json || "[]"));
      } catch {
        products = [];
      }
      const allFiles = Array.isArray(order.customerFiles) ? order.customerFiles : [];
      result.ticket = {
        orderNumber: order.order_number,
        orderStatus: order.order_status,
        paymentStatus: order.payment_status,
        grandTotal: order.grand_total,
        remaining: order.remaining,
        deliveryDate: order.delivery_date,
        deliveryMethod: order.delivery_method,
        customerApproved: Boolean(order.customer_approved),
        products: (Array.isArray(products) ? products : []).map((product: any) => ({
          id: product.id,
          uploadToken: product.uploadToken,
          description: product.description,
          quantity: product.quantity,
          widthMm: product.widthMm,
          heightMm: product.heightMm,
          printSides: product.printSides,
          files: allFiles.filter((file: any) => file.productLineId === product.id).map((file: any) => ({
            id: file.id,
            fileName: file.fileName,
            fileType: file.fileType,
            uploadedAt: file.uploadedAt
          }))
        }))
      };
    }
    result.history = (Array.isArray(order.history) ? order.history : []).slice(-30).map((entry: any) => ({
      date: entry.date,
      status: String(entry.status || "").slice(0, 100),
      note: String(entry.note || "").slice(0, 500)
    }));
    return result;
  }

  const MAX_INLINE_IMAGE_BYTES = 6 * 1024 * 1024;
  const allowedOrderFields = [
    "clientName", "clientEmail", "clientPhone", "clientReference", "clientComments", "clientQuantity",
    "selectedProductId", "selectedProductName", "selectedProductCategory", "customWidth", "customHeight",
    "printSides", "imageSrcUrl", "backImageSrcUrl", "frontRotationDegrees", "backRotationDegrees",
    "frontFitMode", "backFitMode", "frontFileName", "backFileName", "frontPixelWidth", "frontPixelHeight",
    "backPixelWidth", "backPixelHeight", "frontComputedDpi", "backComputedDpi", "tshirt_json"
  ];
  const ticketOrderFields = [
    "order_type", "order_number", "contact_person", "client_address", "client_postcode_city", "delivery_date", "delivery_method", "delivery_address",
    "assisted_by", "order_status", "payment_status", "products_json", "subtotal", "vat", "grand_total",
    "prepayment", "remaining", "customer_approved", "notes", "internal_notes"
  ];

  function isValidInlineImage(value: unknown) {
    if (value === undefined || value === null || value === "") return true;
    if (typeof value !== "string") return false;
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return false;

    const bytes = Buffer.from(match[2], "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_INLINE_IMAGE_BYTES) return false;
    if (match[1] === "png") {
      return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  function validateCustomerFile(value: any) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (typeof value.fileName !== "string" || typeof value.fileType !== "string" || typeof value.dataUrl !== "string") return null;

    const fileName = path.basename(value.fileName.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").trim();
    const match = /^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.dataUrl);
    if (!fileName || fileName.length > 255 || !match || match[1] !== value.fileType) return null;

    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length === 0 || bytes.length > MAX_CUSTOMER_FILE_BYTES) return null;
    if (value.fileType === "application/pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) return null;
    if (value.fileType === "image/png" && !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
    if (value.fileType === "image/jpeg" && (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)) return null;

    return { fileName, fileType: value.fileType, dataUrl: value.dataUrl, size: bytes.length };
  }

  function sanitizeOrderData(data: any, allowTicketFields = false) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    if (typeof data.clientName !== "string" || !data.clientName.trim() || data.clientName.length > 200) return null;
    if (typeof data.clientEmail !== "string" || data.clientEmail.length > 320) return null;
    // Bij een opdrachtbon aan de balie mag het e-mailadres leeg blijven.
    const emailOptional = data.order_type === "opdrachtbon" && data.clientEmail.trim() === "";
    if (!emailOptional && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.clientEmail)) return null;
    if (!isValidInlineImage(data.imageSrcUrl) || !isValidInlineImage(data.backImageSrcUrl)) return null;

    const safeData: Record<string, unknown> = {};
    for (const field of allowTicketFields ? [...allowedOrderFields, ...ticketOrderFields] : allowedOrderFields) {
      if (data[field] !== undefined) safeData[field] = data[field];
    }

    for (const field of [
      "clientPhone", "clientReference", "clientComments", "selectedProductId", "selectedProductName",
      "selectedProductCategory", "frontFileName", "backFileName", "frontFitMode", "backFitMode",
      "order_type", "order_number", "contact_person", "client_address", "client_postcode_city", "delivery_date", "delivery_method", "delivery_address",
      "assisted_by", "order_status", "payment_status", "products_json", "notes", "internal_notes", "tshirt_json"
    ]) {
      const maxLength = field === "products_json" ? 50000 : field === "tshirt_json" ? 10000 : 2000;
      if (safeData[field] !== undefined && (typeof safeData[field] !== "string" || String(safeData[field]).length > maxLength)) return null;
    }
    if (safeData.order_type !== undefined && safeData.order_type !== "opdrachtbon") return null;
    if (safeData.printSides !== undefined && !["single", "double"].includes(String(safeData.printSides))) return null;
    for (const field of [
      "customWidth", "customHeight", "clientQuantity", "frontPixelWidth", "frontPixelHeight", "backPixelWidth",
      "backPixelHeight", "frontComputedDpi", "backComputedDpi", "frontRotationDegrees", "backRotationDegrees",
      "subtotal", "vat", "grand_total", "prepayment", "remaining"
    ]) {
      const value = safeData[field];
      const maxValue = ["subtotal", "vat", "grand_total", "prepayment", "remaining"].includes(field) ? 1000000000 : 100000;
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maxValue)) return null;
    }
    if (safeData.customer_approved !== undefined && typeof safeData.customer_approved !== "boolean") return null;
    if (safeData.delivery_method !== undefined && !["Afhalen", "Bezorgen"].includes(String(safeData.delivery_method))) return null;
    if (safeData.order_status !== undefined && ![
      "Nieuw", "Wacht op klantinformatie", "Wacht op betaling", "Wacht op goedkeuring", "In productie",
      "Gereed", "Afgeleverd/afgehaald", "Afgerond", "Geannuleerd"
    ].includes(String(safeData.order_status))) return null;
    if (safeData.payment_status !== undefined && !["Niet betaald", "Deels betaald", "Volledig betaald"].includes(String(safeData.payment_status))) return null;
    if (safeData.delivery_date !== undefined && safeData.delivery_date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(String(safeData.delivery_date))) return null;
    if (safeData.products_json !== undefined) {
      try {
        const products = JSON.parse(String(safeData.products_json));
        if (!Array.isArray(products) || products.length === 0 || products.length > 100 || products.some((product: any) =>
          !product ||
          typeof product.description !== "string" ||
          !product.description.trim() ||
          product.description.length > 2000 ||
          !Number.isInteger(product.quantity) ||
          product.quantity <= 0 ||
          product.quantity > 100000 ||
          typeof product.unitPrice !== "number" ||
          !Number.isFinite(product.unitPrice) ||
          product.unitPrice < 0 ||
          product.unitPrice > 100000 ||
          typeof product.productId !== "string" ||
          product.productId.length > 100 ||
          typeof product.category !== "string" ||
          product.category.length > 100 ||
          typeof product.widthMm !== "number" ||
          !Number.isFinite(product.widthMm) ||
          product.widthMm <= 0 ||
          product.widthMm > 100000 ||
          typeof product.heightMm !== "number" ||
          !Number.isFinite(product.heightMm) ||
          product.heightMm <= 0 ||
          product.heightMm > 100000 ||
          !["single", "double"].includes(product.printSides) ||
          (product.vatIncluded !== undefined && typeof product.vatIncluded !== "boolean") ||
          (product.fixedTotal !== undefined && product.fixedTotal !== null && (
            typeof product.fixedTotal !== "number" || !Number.isFinite(product.fixedTotal) || product.fixedTotal < 0 || product.fixedTotal > 1000000000
          )) ||
          (product.sku !== undefined && (typeof product.sku !== "string" || product.sku.length > 100)) ||
          (product.priceSource !== undefined && (typeof product.priceSource !== "string" || product.priceSource.length > 300)) ||
          (product.prepressNote !== undefined && (typeof product.prepressNote !== "string" || product.prepressNote.length > 300))
        )) return null;
        safeData.products_json = JSON.stringify(products.map((product: any) => ({
          description: product.description.trim(),
          productId: product.productId,
          category: product.category,
          widthMm: product.widthMm,
          heightMm: product.heightMm,
          printSides: product.printSides,
          quantity: product.quantity,
          unitPrice: product.unitPrice,
          vatIncluded: product.vatIncluded === true,
          ...(typeof product.fixedTotal === "number" ? { fixedTotal: product.fixedTotal } : {}),
          ...(product.sku ? { sku: product.sku } : {}),
          ...(product.priceSource ? { priceSource: product.priceSource } : {}),
          ...(product.prepressNote ? { prepressNote: product.prepressNote } : {})
        })));
      } catch {
        return null;
      }
    }
    if (safeData.tshirt_json !== undefined) {
      // T-shirt (DTF) van de klantpagina: spec controleren en de prijs zelf narekenen.
      const tshirt = normalizeTshirtOrder(safeData.tshirt_json, safeData);
      if (!tshirt) return null;
      safeData.tshirt_json = tshirt;
    }
    if ((safeData.customWidth !== undefined && Number(safeData.customWidth) <= 0) || (safeData.customHeight !== undefined && Number(safeData.customHeight) <= 0)) return null;
    safeData.clientName = data.clientName.trim();
    safeData.clientEmail = data.clientEmail.trim().toLowerCase();
    return safeData;
  }

  function normalizeTshirtOrder(value: unknown, safeData: Record<string, unknown>): string | null {
    let raw: any;
    try {
      raw = JSON.parse(String(value));
    } catch {
      return null;
    }
    const designs = parseTshirtDesigns(raw?.designs);
    if (!designs) return null;
    const spec = parseTshirtSpec({ ...(raw?.spec || {}), prints: printsFromDesigns(designs) });
    if (!spec) return null;
    const price = calculateTshirtPrice(spec);
    if (!price.valid) return null;
    const notes = new Map<string, any>((Array.isArray(raw.designs) ? raw.designs : []).map((design: any) => [design?.id, design]));
    const enriched = designs.map((design) => {
      const extra = notes.get(design.id) || {};
      return {
        ...design,
        dpi: typeof extra.dpi === "number" && Number.isFinite(extra.dpi) ? Math.max(0, Math.min(100000, Math.round(extra.dpi))) : 0,
        check: ["ok", "warning", "error"].includes(extra.check) ? extra.check : "warning",
        checkNotes: Array.isArray(extra.checkNotes) ? extra.checkNotes.filter((note: unknown) => typeof note === "string").slice(0, 5).map((note: string) => note.slice(0, 300)) : [],
      };
    });
    safeData.clientQuantity = price.quantity;
    safeData.selectedProductCategory = "T-shirt";
    return JSON.stringify({ version: 2, spec, designs: enriched, total: price.total, perShirt: price.perShirt, description: price.description, source: price.source, lines: price.lines });
  }

  /** Bestanden van een online T-shirtbestelling: één afbeelding per opdruk plus proefbeelden per kant. */
  function prepareTshirtFiles(orderData: any, filesValue: unknown, proofsValue: unknown) {
    let designs: any[] = [];
    try {
      designs = JSON.parse(String(orderData?.tshirt_json)).designs;
    } catch {
      return null;
    }
    if (!Array.isArray(designs) || !Array.isArray(filesValue) || filesValue.length !== designs.length) return null;
    const now = new Date().toISOString();
    const addFiles: NewFile[] = [];
    const extraFiles: any[] = [];
    const designFiles: Record<string, string> = {};
    let total = 0;
    for (const [index, design] of designs.entries()) {
      const entry = (filesValue as any[]).find((item) => item && item.designId === design?.id);
      const file = validateCustomerFile(entry);
      if (!file || file.fileType === "application/pdf") return null;
      total += file.size;
      const id = crypto.randomBytes(12).toString("hex");
      const side = design.side === "achter" ? "achterkant" : "voorkant";
      addFiles.push({ id, fileName: file.fileName, fileType: file.fileType, dataUrl: file.dataUrl });
      extraFiles.push({ id, fileName: file.fileName, fileType: file.fileType, size: file.size, label: `T-shirt opdruk ${index + 1} – ${side}`, by: "Klant", uploadedAt: now });
      designFiles[String(design.id)] = id;
    }
    const proofFiles: Record<string, string> = {};
    for (const proof of Array.isArray(proofsValue) ? proofsValue.slice(0, 2) : []) {
      const side = proof?.side === "achter" ? "achter" : proof?.side === "voor" ? "voor" : "";
      const file = validateCustomerFile(proof);
      if (!side || !file || file.fileType !== "image/png" || proofFiles[side]) continue;
      total += file.size;
      const id = crypto.randomBytes(12).toString("hex");
      addFiles.push({ id, fileName: file.fileName, fileType: file.fileType, dataUrl: file.dataUrl });
      extraFiles.push({ id, fileName: file.fileName, fileType: file.fileType, size: file.size, label: `Proefbeeld ${side === "voor" ? "voorkant" : "achterkant"}`, by: "Klant", uploadedAt: now });
      proofFiles[side] = id;
    }
    if (total > 45 * 1024 * 1024) return null;
    return { addFiles, fields: { extraFiles, tshirt_files: designFiles, tshirt_proofs: proofFiles } };
  }

  function findProductUpload(order: Order, uploadToken: string) {
    if (order.order_type !== "opdrachtbon" || typeof order.products_json !== "string") return undefined;
    try {
      return JSON.parse(order.products_json).find((product: any) => product.uploadToken === uploadToken);
    } catch {
      return undefined;
    }
  }

  async function createOrder(data: any, assignedStaff?: string, allowTicketFields = false, branch?: unknown, extras?: { addFiles: NewFile[]; fields: Record<string, unknown> }) {
    const safeData = sanitizeOrderData(data, allowTicketFields);
    if (!safeData) return null;

    let productUploadLinks: any[] = [];
    if (safeData.order_type === "opdrachtbon" && typeof safeData.products_json === "string") {
      const products = JSON.parse(safeData.products_json).map((product: any) => ({
        ...product,
        id: crypto.randomBytes(12).toString("hex"),
        uploadToken: crypto.randomBytes(24).toString("hex")
      }));
      safeData.products_json = JSON.stringify(products);
      productUploadLinks = products.map(({ id, uploadToken, description, quantity, widthMm, heightMm, printSides }: any) => ({
        id,
        uploadToken,
        description,
        quantity,
        widthMm,
        heightMm,
        printSides
      }));
    }

    const now = new Date().toISOString();
    const order: Order = {
      id: `FD-${crypto.randomBytes(5).toString("hex").toUpperCase()}`,
      ...safeData,
      ...(assignedStaff ? { assignedStaff } : {}),
      branch: isBranch(branch) ? branch : DEFAULT_BRANCH,
      sharedWith: [],
      trackingToken: crypto.randomBytes(24).toString("hex"),
      createdAt: now,
      status: "Ingediend",
      history: [{
        date: now,
        status: "Ingediend",
        note: "Uw preflight-gevalideerde opdracht is ontvangen en staat in de wachtrij van FD Printing."
      }]
    };

    if (extras) Object.assign(order, extras.fields);
    await storage.insertOrder(order, extras ? { addFiles: extras.addFiles } : undefined);
    return { order, productUploadLinks };
  }

  app.get("/api/health", asyncRoute(async (req, res) => {
    try {
      await storage.ping();
      return res.json({ ok: true, storage: storage.kind });
    } catch (error) {
      console.error("[health] Database niet bereikbaar:", error);
      return res.status(503).json({ ok: false, storage: storage.kind, error: "Database niet bereikbaar." });
    }
  }));

  app.get("/api/catalog", asyncRoute(async (req, res) => {
    const data = await catalog.get();
    return res.json({ ...catalog.status(), products: data.products });
  }));

  app.get("/api/admin/map", requireAdmin, asyncRoute(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    return res.json(await projectMap.get(req.query.refresh === "1"));
  }));

  // Taakstatussen en eigen ideeën voor de overzichtskaart (/map).
  const MAP_STATE_KEY = "map_state_v1";
  const MAP_STATUSES = ["Idee", "Te doen", "Bezig", "Klaar", "Niet doen"];
  const MAP_SOURCES = ["Eigen idee"];
  const MAP_PRIORITIES = ["Hoog", "Middel", "Laag"];
  app.get("/api/admin/map/state", requireAdmin, asyncRoute(async (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const raw = await storage.getMeta(MAP_STATE_KEY);
    try {
      return res.json(raw ? JSON.parse(raw) : { statuses: {}, custom: [] });
    } catch {
      return res.json({ statuses: {}, custom: [] });
    }
  }));
  app.put("/api/admin/map/state", requireAdmin, asyncRoute(async (req, res) => {
    const body = req.body || {};
    const statuses: Record<string, string> = {};
    if (body.statuses && typeof body.statuses === "object") {
      for (const [key, value] of Object.entries(body.statuses).slice(0, 500)) {
        if (typeof value === "string" && MAP_STATUSES.includes(value) && key.length <= 60) statuses[key] = value;
      }
    }
    const custom: any[] = [];
    if (Array.isArray(body.custom)) {
      for (const item of body.custom.slice(0, 200)) {
        if (!item || typeof item.id !== "string" || typeof item.title !== "string" || !item.title.trim()) continue;
        custom.push({
          id: item.id.slice(0, 60),
          nodeId: String(item.nodeId || "").slice(0, 40),
          title: item.title.trim().slice(0, 140),
          what: String(item.what || "").slice(0, 600),
          source: MAP_SOURCES.includes(item.source) ? item.source : "Eigen idee",
          priority: MAP_PRIORITIES.includes(item.priority) ? item.priority : "Laag",
          effort: item.effort === "Groot" ? "Groot" : "Quick win",
          status: MAP_STATUSES.includes(item.status) ? item.status : "Idee",
          custom: true,
          createdAt: String(item.createdAt || "").slice(0, 40),
        });
      }
    }
    await storage.setMeta(MAP_STATE_KEY, JSON.stringify({ statuses, custom }));
    return res.json({ ok: true });
  }));

  app.post("/api/admin/catalog/sync", requireAdmin, asyncRoute(async (req, res) => {
    try {
      await catalog.sync();
      return res.json({ ok: true, ...catalog.status() });
    } catch {
      return res.status(502).json({ ok: false, ...catalog.status() });
    }
  }));

  app.get("/api/public/orders/:token/files/:fileId", asyncRoute(async (req, res) => {
    const { token, fileId } = req.params;
    if (!/^[a-f0-9]{48}$/.test(token) || !/^[a-f0-9]{24}$/.test(fileId)) {
      return res.status(404).json({ error: "File not found." });
    }
    let order = await storage.findOrderByTrackingToken(token);
    let productLineId: string | null = null;
    if (!order) {
      order = await storage.findOrderByUploadToken(token);
      productLineId = order ? findProductUpload(order, token)?.id || "-" : null;
    }
    const meta = (Array.isArray(order?.customerFiles) ? order!.customerFiles : []).find((item: any) => item.id === fileId);
    if (!order || !meta || (productLineId !== null && meta.productLineId !== productLineId)) {
      return res.status(404).json({ error: "File not found." });
    }
    const file = await storage.getFile(order.id, fileId);
    if (!file) return res.status(404).json({ error: "File not found." });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", "inline");
    return res.type(file.fileType).send(file.data);
  }));

  app.post("/api/auth/login", rateLimit(AUTH_RATE_LIMIT_MAX_REQUESTS), asyncRoute(async (req, res) => {
    const submittedPassword = typeof req.body?.password === "string" ? req.body.password : "";
    const requestedBranch = req.body?.branch;
    const requestedStaffId = typeof req.body?.staffId === "string" ? req.body.staffId : "";
    let sessionId: string;
    let loginBranch = "";

    if (requestedStaffId) {
      // Persoonlijke login: eigen wachtwoord en eigen rechten, ingesteld door de beheerder.
      const member = (await storage.listStaff()).find((item) => item.id === requestedStaffId);
      const stored = member ? await storage.getMeta(`staffpw:${member.id}`) : null;
      if (!member || !isBranch(member.branch) || !stored || !submittedPassword || !verifyPassword(submittedPassword, stored)) {
        return res.status(401).json({ error: "Invalid password." });
      }
      loginBranch = member.branch;
      sessionId = await createAdminSession("branch", member.branch, member.id);
    } else if (isBranch(requestedBranch)) {
      // Filiaal-login: elk filiaal heeft een eigen wachtwoord dat de beheerder instelt.
      const stored = await storage.getMeta(`branchpw:${requestedBranch}`);
      if (!stored) return res.status(401).json({ error: "Voor dit filiaal is nog geen wachtwoord ingesteld. Vraag de beheerder." });
      if (!submittedPassword || !verifyPassword(submittedPassword, stored)) return res.status(401).json({ error: "Invalid password." });
      loginBranch = requestedBranch;
      sessionId = await createAdminSession("branch", requestedBranch);
    } else {
      if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
        return res.status(503).json({ error: "Admin auth is not configured." });
      }
      if (!safeCompare(submittedPassword, ADMIN_PASSWORD)) {
        return res.status(401).json({ error: "Invalid password." });
      }
      sessionId = await createAdminSession("admin");
    }

    res.cookie("fd_admin_session", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_MS,
    });

    return res.json({ ok: true, role: loginBranch ? "branch" : "admin", branch: loginBranch });
  }));

  app.post("/api/auth/logout", asyncRoute(async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.fd_admin_session;
    if (sessionId) {
      await storage.deleteSession(sessionId);
      if (/^[a-f0-9]{64}$/.test(sessionId)) await storage.setMeta(sessionRoleKey(sessionId), "");
    }

    res.clearCookie("fd_admin_session", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    return res.json({ ok: true });
  }));

  app.get("/api/auth/session", asyncRoute(async (req, res) => {
    const info = await getSessionInfo(req);
    return res.json({
      authenticated: Boolean(info),
      role: info?.role ?? null,
      branch: info?.branch ?? "",
      staffName: info?.staffName ?? "",
      permissions: info ? (info.role === "admin" || info.perms === null ? [...STAFF_PERMISSIONS] : info.perms) : [],
      branches: BRANCHES
    });
  }));

  app.get("/api/staff", requireStaffSession, asyncRoute(async (req, res) => {
    const info = res.locals.session as SessionInfo;
    const staff = await storage.listStaff();
    // Een filiaal ziet alleen de eigen medewerkers (en medewerkers die nog geen filiaal hebben).
    res.json(info.role === "admin" ? staff : staff.filter((member) => !member.branch || member.branch === info.branch));
  }));

  // Namen voor het keuzemenu "Geholpen door" op de opdrachtbon (geen inlog nodig; alleen namen per filiaal).
  app.get("/api/public/staff", asyncRoute(async (req, res) => {
    const branch = req.query.branch;
    if (!isBranch(branch)) return res.status(400).json({ error: "Kies een filiaal." });
    const staff = await storage.listStaff();
    const inBranch = staff.filter((member) => !member.branch || member.branch === branch);
    const members: Array<{ id: string; name: string }> = [];
    for (const member of inBranch) if (member.branch === branch && (await storage.getMeta(`staffpw:${member.id}`))) members.push({ id: member.id, name: member.name });
    res.json({ names: inBranch.map((member) => member.name), members });
  }));

  // Inlogkeuze: alle medewerkers met een eigen wachtwoord, per filiaal (alleen naam en filiaal).
  app.get("/api/public/staff-login", asyncRoute(async (req, res) => {
    const members: Array<{ id: string; name: string; branch: string }> = [];
    for (const member of await storage.listStaff()) {
      if (isBranch(member.branch) && (await storage.getMeta(`staffpw:${member.id}`))) members.push({ id: member.id, name: member.name, branch: member.branch });
    }
    res.json({ members });
  }));

  app.post("/api/staff", requireAdmin, asyncRoute(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const role = typeof req.body?.role === "string" ? req.body.role.trim() : "";
    const branch = req.body?.branch;
    if (!name || !role || name.length > 200 || role.length > 200) {
      return res.status(400).json({ error: "Naam en rol zijn verplicht." });
    }
    if (!isBranch(branch)) {
      return res.status(400).json({ error: "Kies een filiaal voor deze medewerker." });
    }
    const newMember = {
      id: `S-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      name,
      role,
      branch
    };
    await storage.addStaff(newMember);
    res.json(newMember);
  }));

  app.get("/api/admin/staff-access", requireAdmin, asyncRoute(async (req, res) => {
    const staff = await storage.listStaff();
    const access: Record<string, { permissions: StaffPermission[]; passwordSet: boolean }> = {};
    for (const member of staff) {
      access[member.id] = { permissions: parsePerms(await storage.getMeta(`staffperm:${member.id}`)), passwordSet: Boolean(await storage.getMeta(`staffpw:${member.id}`)) };
    }
    res.json({ permissionsAvailable: STAFF_PERMISSIONS, access });
  }));

  app.put("/api/admin/staff/:id/access", requireAdmin, asyncRoute(async (req, res) => {
    const member = (await storage.listStaff()).find((item) => item.id === req.params.id);
    if (!member) return res.status(404).json({ error: "Medewerker niet gevonden." });
    const { permissions, password } = req.body || {};
    if (permissions !== undefined) {
      if (!Array.isArray(permissions) || !permissions.every((perm: unknown) => STAFF_PERMISSIONS.includes(perm as StaffPermission))) {
        return res.status(400).json({ error: "Ongeldige rechten." });
      }
      await storage.setMeta(`staffperm:${member.id}`, JSON.stringify(permissions));
    }
    if (password !== undefined && password !== "") {
      if (typeof password !== "string" || password.length < 8 || password.length > 100) return res.status(400).json({ error: "Het wachtwoord moet 8 tot 100 tekens zijn." });
      if (!isBranch(member.branch)) return res.status(400).json({ error: "Geef deze medewerker eerst een filiaal." });
      await storage.setMeta(`staffpw:${member.id}`, hashPassword(password));
    }
    res.json({ success: true });
  }));

  app.delete("/api/staff/:id", requireAdmin, asyncRoute(async (req, res) => {
    await storage.deleteStaff(req.params.id);
    await storage.setMeta(`staffpw:${req.params.id}`, "");
    await storage.setMeta(`staffperm:${req.params.id}`, "");
    res.json({ success: true });
  }));

  app.get("/api/admin/branches", requireAdmin, asyncRoute(async (req, res) => {
    const branches = await Promise.all(BRANCHES.map(async (branch) => ({ branch, passwordSet: Boolean(await storage.getMeta(`branchpw:${branch}`)), permissions: parsePerms(await storage.getMeta(`branchperm:${branch}`)) })));
    res.json({ branches });
  }));

  app.put("/api/admin/branches/:branch/permissions", requireAdmin, asyncRoute(async (req, res) => {
    const branch = req.params.branch;
    const permissions = req.body?.permissions;
    if (!isBranch(branch)) return res.status(404).json({ error: "Onbekend filiaal." });
    if (!Array.isArray(permissions) || !permissions.every((perm: unknown) => STAFF_PERMISSIONS.includes(perm as StaffPermission))) {
      return res.status(400).json({ error: "Ongeldige rechten." });
    }
    await storage.setMeta(`branchperm:${branch}`, JSON.stringify(permissions));
    res.json({ success: true });
  }));

  app.put("/api/admin/staff/:id/branch", requireAdmin, asyncRoute(async (req, res) => {
    const branch = req.body?.branch;
    if (!isBranch(branch)) return res.status(400).json({ error: "Kies een filiaal." });
    if (!(await storage.listStaff()).some((member) => member.id === req.params.id)) return res.status(404).json({ error: "Medewerker niet gevonden." });
    await storage.updateStaffBranch(req.params.id, branch);
    res.json({ success: true });
  }));

  app.put("/api/admin/branches/:branch/password", requireAdmin, asyncRoute(async (req, res) => {
    const branch = req.params.branch;
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!isBranch(branch)) return res.status(404).json({ error: "Onbekend filiaal." });
    if (password.length < 8 || password.length > 100) return res.status(400).json({ error: "Het wachtwoord moet 8 tot 100 tekens zijn." });
    await storage.setMeta(`branchpw:${branch}`, hashPassword(password));
    res.json({ success: true });
  }));

  const visibleOrders = async (info: SessionInfo) => (await storage.listOrders()).filter((order) => canSeeOrder(order, info)).map(serializeAdminOrder);

  app.get("/api/orders", requireStaffSession, asyncRoute(async (req, res) => {
    res.json(await visibleOrders(res.locals.session));
  }));

  app.get("/api/admin/orders", requireStaffSession, asyncRoute(async (req, res) => {
    res.json(await visibleOrders(res.locals.session));
  }));

  app.get("/api/orders/:id", requireStaffSession, asyncRoute(async (req, res) => {
    const order = await storage.getOrder(req.params.id);
    if (!order || !canSeeOrder(order, res.locals.session)) {
      return res.status(404).json({ error: "Order not found." });
    }
    res.json(serializeAdminOrder(order));
  }));

  app.get("/api/orders/:id/files/:fileId", requireStaffSession, asyncRoute(async (req, res) => {
    if (!hasPerm(res.locals.session, "bestanden")) return denyPerm(res);
    if (!/^[a-f0-9]{24}$/.test(req.params.fileId)) {
      return res.status(404).json({ error: "File not found." });
    }
    const order = await storage.getOrder(req.params.id);
    if (!order || !canSeeOrder(order, res.locals.session)) {
      return res.status(404).json({ error: "File not found." });
    }

    const file = await storage.getFile(req.params.id, req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: "File not found." });
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.type(file.fileType).attachment(file.fileName).send(file.data);
  }));

  // Extra bijlagen bij een opdracht (intern; de klant ziet ze niet).
  app.post("/api/orders/:id/attachments", requireStaffSession, asyncRoute(async (req, res) => {
    const info = res.locals.session as SessionInfo;
    if (!hasPerm(info, "bestanden")) return denyPerm(res);
    const current = await storage.getOrder(req.params.id);
    if (!current || !canSeeOrder(current, info)) return res.status(404).json({ error: "Order not found." });
    const file = validateCustomerFile(req.body?.file);
    if (!file) return res.status(400).json({ error: "Upload een geldig PDF-, PNG- of JPG-bestand van maximaal 20 MB." });
    const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 200) : "";
    const printReady = req.body?.printReady === true;
    const prepressOf = typeof req.body?.prepressOf === "string" ? req.body.prepressOf : "";
    if (prepressOf) {
      if (!hasPerm(info, "prepress")) return denyPerm(res);
      if (!(Array.isArray((current as any).customerFiles) ? (current as any).customerFiles : []).some((item: any) => item.id === prepressOf)) {
        return res.status(400).json({ error: "Het bestand waarvoor de pre-press check is gedaan bestaat niet." });
      }
    }
    const prepressOk = req.body?.prepressOk === true;
    const prepressNote = cleanNote(req.body?.prepressNote);
    const prepressBleed = cleanBleed(req.body?.prepressBleedMm);
    const actor = await resolveActor(info, req.body?.actingAs);
    let limitReached = false;
    const updated = await storage.updateOrder(req.params.id, (order) => {
      const existing: any[] = Array.isArray((order as any).extraFiles) ? (order as any).extraFiles : [];
      if (existing.length >= 30) { limitReached = true; return false; }
      const fileId = crypto.randomBytes(12).toString("hex");
      const uploadedAt = new Date().toISOString();
      (order as any).extraFiles = [...existing, { id: fileId, fileName: file.fileName, fileType: file.fileType, size: file.size, label, by: actor, uploadedAt, ...(printReady ? { printReady: true } : {}), ...(prepressOf ? { prepressOf } : {}) }];
      order.history = Array.isArray(order.history) ? order.history : [];
      order.history.push({ date: uploadedAt, status: order.status || "Ingediend", note: printReady ? `Bestand klaar om te printen: ${file.fileName}${label ? ` (${label})` : ""}.` : `Extra bijlage toegevoegd: ${file.fileName}${label ? ` (${label})` : ""}.`, internal: true, by: actor } as any);
      // Klaar om te printen = bestand is in orde: een nog niet goedgekeurde opdracht gaat naar "Preflight Goedgekeurd".
      if (prepressOf) {
        const original = ((order as any).customerFiles || []).find((item: any) => item.id === prepressOf);
        if (original) {
          original.prepress = { ok: prepressOk, note: prepressNote, bleedMm: prepressBleed, by: actor, at: uploadedAt, processedId: fileId };
          order.history.push({ date: uploadedAt, status: order.status || "Ingediend", note: `Pre-press check gedaan voor ${original.fileName}${prepressNote ? `: ${prepressNote}` : ""}.`, internal: true, by: actor } as any);
        }
      }
      if ((printReady || (prepressOf && prepressOk)) && PRE_APPROVAL_STATUSES.includes(order.status || "Ingediend")) {
        order.status = "Preflight Goedgekeurd";
        order.history.push({ date: uploadedAt, status: "Preflight Goedgekeurd", note: "Uw bestand is gecontroleerd en klaar om te printen.", by: actor } as any);
      }
      const newFile: NewFile = { id: fileId, fileName: file.fileName, fileType: file.fileType, dataUrl: file.dataUrl };
      return { addFiles: [newFile] };
    });
    if (limitReached) return res.status(400).json({ error: "Er zijn al 30 extra bijlagen toegevoegd." });
    if (!updated) return res.status(404).json({ error: "Order not found." });
    return res.json({ success: true, order: serializeAdminOrder(updated) });
  }));

  app.delete("/api/orders/:id/attachments/:fileId", requireStaffSession, asyncRoute(async (req, res) => {
    const info = res.locals.session as SessionInfo;
    if (!hasPerm(info, "bestanden")) return denyPerm(res);
    if (!/^[a-f0-9]{24}$/.test(req.params.fileId)) return res.status(404).json({ error: "File not found." });
    const current = await storage.getOrder(req.params.id);
    if (!current || !canSeeOrder(current, info)) return res.status(404).json({ error: "Order not found." });
    const target = (Array.isArray((current as any).extraFiles) ? (current as any).extraFiles : []).find((item: any) => item.id === req.params.fileId);
    if (!target) return res.status(404).json({ error: "File not found." });
    const actor = await resolveActor(info, req.body?.actingAs ?? req.query.actingAs);
    const updated = await storage.updateOrder(req.params.id, (order) => {
      (order as any).extraFiles = ((order as any).extraFiles || []).filter((item: any) => item.id !== req.params.fileId);
      order.history = Array.isArray(order.history) ? order.history : [];
      order.history.push({ date: new Date().toISOString(), status: order.status || "Ingediend", note: `Extra bijlage verwijderd: ${target.fileName}.`, internal: true, by: actor } as any);
      return { removeFileIds: [req.params.fileId] };
    });
    if (!updated) return res.status(404).json({ error: "Order not found." });
    return res.json({ success: true, order: serializeAdminOrder(updated) });
  }));

  app.get("/api/public/orders/:trackingToken", asyncRoute(async (req, res) => {
    const token = req.params.trackingToken;
    if (!/^[a-f0-9]{48}$/.test(token)) {
      return res.status(404).json({ error: "Order not found." });
    }

    const trackedOrder = await storage.findOrderByTrackingToken(token);
    if (trackedOrder) return res.json(serializePublicOrder(trackedOrder));

    const uploadOrder = await storage.findOrderByUploadToken(token);
    const productUpload = uploadOrder ? findProductUpload(uploadOrder, token) : undefined;
    if (!uploadOrder || !productUpload) {
      return res.status(404).json({ error: "Order not found." });
    }
    return res.json(serializePublicOrder(uploadOrder, productUpload));
  }));

  app.post("/api/orders", rateLimit(10), asyncRoute(async (req, res) => {
    const orderData = req.body?.orderData;
    if (orderData?.order_type === "opdrachtbon") {
      // Opdrachtbonnen maakt alleen ingelogd personeel (via /api/admin/orders).
      return res.status(401).json({ error: "Log in via de backoffice om een opdrachtbon te maken." });
    }
    if (false as boolean) {
      if (
        typeof orderData.order_number !== "string" ||
        typeof orderData.products_json !== "string" ||
        typeof orderData.grand_total !== "number" ||
        !Number.isFinite(orderData.grand_total)
      ) {
        return res.status(400).json({ error: "Invalid order data." });
      }

      // Betaling mag direct op de bon worden vastgelegd (balie). Omdat dit zonder inlog gebeurt, markeren we het
      // voor controle in de backoffice.
      const total = orderData.grand_total;
      const claimedPrepayment = Number.isFinite(Number(orderData.prepayment)) ? Math.min(Math.max(0, Number(orderData.prepayment)), total) : 0;
      const claimedStatus = ["Deels betaald", "Volledig betaald"].includes(String(orderData.payment_status)) ? String(orderData.payment_status) : "Niet betaald";
      const paymentStatus = claimedStatus === "Deels betaald" && claimedPrepayment <= 0 ? "Niet betaald" : claimedStatus;
      const settled = paymentStatus === "Volledig betaald";
      const ticketOrder = {
        ...orderData,
        order_status: "Nieuw",
        payment_status: paymentStatus,
        prepayment: settled && claimedPrepayment <= 0 ? 0 : claimedPrepayment,
        remaining: settled ? 0 : Math.max(0, Math.round((total - claimedPrepayment) * 100) / 100),
        customer_approved: false,
        assisted_by: typeof orderData.assisted_by === "string" ? orderData.assisted_by.trim().slice(0, 200) : "",
        internal_notes: paymentStatus === "Niet betaald"
          ? ""
          : `Betaling is op de bon ingevuld zonder inlog (${paymentStatus.toLowerCase()}, aanbetaling € ${claimedPrepayment.toFixed(2).replace(".", ",")}). Controleer dit in de backoffice.`,
      };
      const ticketBranch = isBranch(orderData.branch) ? orderData.branch : null;
      if (!ticketBranch) return res.status(400).json({ error: "Kies het filiaal waar de bon wordt gemaakt." });
      const branchStaff = (await storage.listStaff()).filter((member) => !member.branch || member.branch === ticketBranch).map((member) => member.name);
      if (!ticketOrder.assisted_by || (branchStaff.length > 0 && !branchStaff.includes(ticketOrder.assisted_by))) {
        return res.status(400).json({ error: "Kies de medewerker die de klant heeft geholpen." });
      }
      const created = await createOrder(ticketOrder, undefined, true, ticketBranch);
      if (!created) return res.status(400).json({ error: "Invalid order data." });
      return res.status(201).json({
        success: true,
        orderId: created.order.id,
        trackingToken: created.order.trackingToken,
        productUploadLinks: created.productUploadLinks,
        branch: ticketBranch
      });
    }

    let tshirtExtras: ReturnType<typeof prepareTshirtFiles> | undefined;
    if (orderData?.tshirt_json !== undefined) {
      tshirtExtras = prepareTshirtFiles(orderData, req.body?.tshirtFiles, req.body?.tshirtProofs);
      if (!tshirtExtras) return res.status(400).json({ error: "De T-shirtbestanden zijn ongeldig of te groot (max 20 MB per afbeelding, 40 MB samen)." });
      // Afbeeldingen staan als bestanden bij de opdracht, niet in de opdrachtgegevens.
      delete orderData.imageSrcUrl;
      delete orderData.backImageSrcUrl;
    }
    const created = await createOrder(orderData, undefined, false, isBranch(orderData?.branch) ? orderData.branch : DEFAULT_BRANCH, tshirtExtras || undefined);
    if (!created) return res.status(400).json({ error: orderData?.tshirt_json !== undefined ? "De T-shirtbestelling kon niet worden gecontroleerd. Controleer de opdrukken en maten." : "Invalid order data." });
    return res.status(201).json({ success: true, orderId: created.order.id, trackingToken: created.order.trackingToken });
  }));

  app.post("/api/admin/orders", requireStaffSession, asyncRoute(async (req, res) => {
    const info = res.locals.session as SessionInfo;
    if (!hasPerm(info, "bon_maken")) return denyPerm(res);
    const orderData = req.body?.orderData;
    // Een filiaal maakt altijd orders voor het eigen filiaal; de beheerder kiest zelf.
    const newBranch = info.role === "branch" ? info.branch : isBranch(orderData?.branch) ? orderData.branch : DEFAULT_BRANCH;
    const assignedStaff = typeof orderData?.assignedStaff === "string" ? orderData.assignedStaff.trim() : "";
    const staffExists = !assignedStaff || (await storage.listStaff()).some((member) => member.name === assignedStaff);
    if (!staffExists) return res.status(400).json({ error: "Invalid staff assignment." });
    const created = await createOrder(orderData, assignedStaff || undefined, true, newBranch);
    if (!created) return res.status(400).json({ error: "Invalid order data." });
    return res.status(201).json({
      success: true,
      orderId: created.order.id,
      trackingToken: created.order.trackingToken,
      productUploadLinks: created.productUploadLinks,
      branch: newBranch
    });
  }));

  app.put("/api/orders/:id", requireStaffSession, asyncRoute(async (req, res) => {
    const info = res.locals.session as SessionInfo;
    const { status, note, assignedStaff, payment, sharedWith, moveToBranch, edit, logNote, extraInfo, helpRequest, actingAs, prepressCheck } = req.body || {};
    const actor = await resolveActor(info, actingAs);
    const current = await storage.getOrder(req.params.id);
    if (!current || !canSeeOrder(current, info)) return res.status(404).json({ error: "Order not found." });
    if ((edit !== undefined || sharedWith !== undefined || moveToBranch !== undefined) && !hasPerm(info, "bon_aanpassen")) return denyPerm(res);
    if (payment !== undefined && !hasPerm(info, "betaling")) return denyPerm(res);
    if ((status !== undefined || note !== undefined || assignedStaff !== undefined || logNote !== undefined || extraInfo !== undefined || helpRequest !== undefined) && !hasPerm(info, "status_wijzigen")) return denyPerm(res);
    if (extraInfo !== undefined && (typeof extraInfo !== "string" || extraInfo.length > 3000)) return res.status(400).json({ error: "De extra info is te lang (maximaal 3000 tekens)." });
    if (logNote !== undefined && (typeof logNote !== "string" || logNote.length > 500)) return res.status(400).json({ error: "Invalid note." });
    if ((sharedWith !== undefined || moveToBranch !== undefined || edit !== undefined) && !canManageOrder(current, info)) {
      return res.status(403).json({ error: "Alleen het filiaal van deze opdracht of de beheerder kan dit aanpassen." });
    }
    if (sharedWith !== undefined && (!Array.isArray(sharedWith) || sharedWith.length > BRANCHES.length || !sharedWith.every(isBranch))) {
      return res.status(400).json({ error: "Ongeldige filialen om mee te delen." });
    }
    if (moveToBranch !== undefined && (info.role !== "admin" || !isBranch(moveToBranch))) {
      return res.status(403).json({ error: "Alleen de beheerder kan een opdracht naar een ander filiaal verplaatsen." });
    }
    let editData: Record<string, unknown> | null = null;
    let editedProducts: any[] | null = null;
    if (edit !== undefined) {
      if (current.order_type !== "opdrachtbon") return res.status(400).json({ error: "Alleen opdrachtbonnen kunnen zo worden aangepast." });
      const incoming = (() => { try { return JSON.parse(String(edit?.orderData?.products_json)); } catch { return null; } })();
      editData = sanitizeOrderData({ ...edit?.orderData, order_type: "opdrachtbon" }, true);
      if (!editData || !Array.isArray(incoming)) return res.status(400).json({ error: "Ongeldige opdrachtbon." });
      const oldProducts: any[] = (() => { try { return JSON.parse(String(current.products_json)); } catch { return []; } })();
      const cleaned: any[] = JSON.parse(String(editData.products_json));
      // Bestaande productregels houden hun id en uploadlink; nieuwe regels krijgen er een.
      editedProducts = cleaned.map((product, index) => {
        const previous = oldProducts.find((item) => item?.id && item.id === incoming[index]?.id);
        return { ...product, id: previous?.id ?? crypto.randomBytes(12).toString("hex"), uploadToken: previous?.uploadToken ?? crypto.randomBytes(24).toString("hex") };
      });
    }
    if (payment !== undefined) {
      const okAction = payment && typeof payment === "object" && (
        (payment.action === "set-prepayment" && typeof payment.amount === "number" && Number.isFinite(payment.amount) && payment.amount >= 0 && payment.amount <= 1000000000) ||
        payment.action === "mark-paid" || payment.action === "mark-unpaid"
      );
      if (!okAction) return res.status(400).json({ error: "Invalid payment update." });
    }
    if (prepressCheck !== undefined) {
      if (!hasPerm(info, "prepress")) return denyPerm(res);
      const pc = prepressCheck as any;
      const known = (Array.isArray((current as any).customerFiles) ? (current as any).customerFiles : []).some((item: any) => item.id === pc?.fileId);
      if (!pc || typeof pc !== "object" || typeof pc.ok !== "boolean" || !known) return res.status(400).json({ error: "Ongeldige pre-press check." });
    }
    const helpOpen = (Array.isArray(current.helpRequests) ? current.helpRequests : []) as any[];
    if (helpRequest !== undefined) {
      const hr = helpRequest as any;
      const isAdmin = info.role === "admin";
      if (!hr || typeof hr !== "object") return res.status(400).json({ error: "Ongeldige hulpvraag." });
      if (hr.action === "create") {
        const to = typeof hr.to === "string" ? hr.to.trim() : "";
        const message = typeof hr.message === "string" ? hr.message.trim() : "";
        if (!to || !message || message.length > 500) return res.status(400).json({ error: "Kies een collega en schrijf kort wat er moet gebeuren (max. 500 tekens)." });
        const allowed = [orderBranch(current), ...(Array.isArray(current.sharedWith) ? current.sharedWith : []), info.branch];
        const member = (await storage.listStaff()).find((item) => item.name === to && (!item.branch || allowed.includes(item.branch)));
        if (!member) return res.status(400).json({ error: "Deze collega is niet gevonden." });
      } else if (["accepted", "declined", "done", "cancel"].includes(hr.action)) {
        const target = helpOpen.find((item) => item.id === hr.id);
        if (!target) return res.status(404).json({ error: "Deze hulpvraag bestaat niet meer." });
        if (hr.reply !== undefined && (typeof hr.reply !== "string" || hr.reply.length > 300)) return res.status(400).json({ error: "Het antwoord is te lang (max. 300 tekens)." });
        if (hr.action === "accepted" || hr.action === "declined") {
          if (target.status !== "open") return res.status(409).json({ error: "Deze hulpvraag is al beantwoord." });
          if (!isAdmin && actor !== target.to) return res.status(403).json({ error: `Alleen ${target.to} kan dit beantwoorden. Kies bovenin wie je bent.` });
        } else if (hr.action === "done") {
          if (target.status !== "accepted") return res.status(409).json({ error: "Alleen een geaccepteerde hulpvraag kan klaar worden gemeld." });
          if (!isAdmin && actor !== target.to && actor !== target.from) return res.status(403).json({ error: "Alleen de gevraagde collega of de aanvrager kan dit afronden." });
        } else {
          if (target.status !== "open") return res.status(409).json({ error: "Deze hulpvraag is al beantwoord." });
          if (!isAdmin && actor !== target.from) return res.status(403).json({ error: "Alleen de aanvrager kan de vraag intrekken." });
        }
      } else {
        return res.status(400).json({ error: "Ongeldige hulpvraag." });
      }
    }
    if (status !== undefined && (typeof status !== "string" || status.length > 100)) {
      return res.status(400).json({ error: "Invalid status." });
    }
    if (note !== undefined && (typeof note !== "string" || note.length > 2000)) {
      return res.status(400).json({ error: "Invalid note." });
    }
    if (assignedStaff !== undefined && (typeof assignedStaff !== "string" || assignedStaff.length > 200)) {
      return res.status(400).json({ error: "Invalid staff assignment." });
    }

    const updated = await storage.updateOrder(req.params.id, (order) => {
      const oldStatus = order.status || "Ingediend";
      order.history = Array.isArray(order.history) ? order.history : [];
      const historyStart = order.history.length;
      if (status) {
        order.status = status;
        order.history.push({
          date: new Date().toISOString(),
          status,
          note: note || `Status gewijzigd van ${oldStatus} naar ${status}.`
        });
      }

      if (payment) {
        const o = order as any;
        const total = Number(o.grand_total || 0);
        const euro = (value: number) => `€ ${value.toFixed(2).replace(".", ",")}`;
        let paymentNote = "";
        if (payment.action === "set-prepayment") {
          const amount = Math.min(Math.round(payment.amount * 100) / 100, total);
          o.prepayment = amount;
          o.payment_status = amount >= total && total > 0 ? "Volledig betaald" : amount > 0 ? "Deels betaald" : "Niet betaald";
          o.remaining = Math.max(0, Math.round((total - amount) * 100) / 100);
          paymentNote = `Aanbetaling geregistreerd: ${euro(amount)}.`;
        } else if (payment.action === "mark-paid") {
          o.payment_status = "Volledig betaald";
          o.remaining = 0;
          paymentNote = "Restbedrag als betaald geregistreerd.";
        } else {
          o.payment_status = Number(o.prepayment || 0) > 0 ? "Deels betaald" : "Niet betaald";
          o.remaining = Math.max(0, Math.round((total - Number(o.prepayment || 0)) * 100) / 100);
          paymentNote = "Betaling teruggezet naar openstaand.";
        }
        order.history.push({
          date: new Date().toISOString(),
          status: status || order.status || "Betaling",
          note: paymentNote
        });
      }

      if (sharedWith !== undefined) {
        const own = orderBranch(order);
        order.sharedWith = (sharedWith as string[]).filter((branch, index, all) => branch !== own && all.indexOf(branch) === index);
        order.history.push({
          date: new Date().toISOString(),
          status: order.status || "Gedeeld",
          note: order.sharedWith.length ? `Opdracht gedeeld met: ${order.sharedWith.join(", ")}.` : "Delen van de opdracht gestopt.",
          internal: true
        });
      }

      if (moveToBranch !== undefined) {
        order.branch = moveToBranch;
        order.sharedWith = (Array.isArray(order.sharedWith) ? order.sharedWith : []).filter((branch: string) => branch !== moveToBranch);
        order.history.push({ date: new Date().toISOString(), status: order.status || "Verplaatst", note: `Opdracht verplaatst naar filiaal ${moveToBranch}.`, internal: true });
      }

      if (editData && editedProducts) {
        for (const [key, value] of Object.entries(editData)) {
          if (key === "products_json") continue;
          (order as any)[key] = value;
        }
        (order as any).products_json = JSON.stringify(editedProducts);
        order.history.push({
          date: new Date().toISOString(),
          status: order.status || "Aangepast",
          note: `Opdrachtbon aangepast${info.role === "branch" ? ` (${info.branch})` : " door de beheerder"}.`,
          internal: true
        });
      }

      if (typeof logNote === "string" && logNote.trim()) {
        order.history.push({ date: new Date().toISOString(), status: order.status || "Ingediend", note: logNote.trim(), internal: true });
      }

      if (typeof extraInfo === "string") {
        (order as any).extraInfo = extraInfo.trim();
        order.history.push({ date: new Date().toISOString(), status: order.status || "Ingediend", note: extraInfo.trim() ? "Extra info bij de specificatie aangepast." : "Extra info bij de specificatie verwijderd.", internal: true });
      }

      if (prepressCheck) {
        const pc = prepressCheck as any;
        const now = new Date().toISOString();
        const original = ((order as any).customerFiles || []).find((item: any) => item.id === pc.fileId);
        if (original) {
          const note = cleanNote(pc.note);
          original.prepress = { ok: pc.ok, note, by: actor, at: now, useOriginal: true };
          order.history.push({ date: now, status: order.status || "Ingediend", note: `Pre-press check gedaan voor ${original.fileName} (origineel gebruikt)${note ? `: ${note}` : ""}.`, internal: true });
          if (pc.ok && PRE_APPROVAL_STATUSES.includes(order.status || "Ingediend")) {
            order.status = "Preflight Goedgekeurd";
            order.history.push({ date: now, status: "Preflight Goedgekeurd", note: "Uw bestand is gecontroleerd en klaar om te printen." });
          }
        }
      }

      if (helpRequest) {
        const hr = helpRequest as any;
        const now = new Date().toISOString();
        const list: any[] = Array.isArray((order as any).helpRequests) ? [...(order as any).helpRequests] : [];
        const addNote = (text: string) => order.history.push({ date: now, status: order.status || "Ingediend", note: text, internal: true });
        if (hr.action === "create") {
          const item = { id: crypto.randomBytes(8).toString("hex"), from: actor, to: String(hr.to).trim(), message: String(hr.message).trim(), status: "open", createdAt: now };
          list.push(item);
          addNote(`Hulp gevraagd aan ${item.to}: ${item.message}`);
        } else {
          const item = list.find((entry) => entry.id === hr.id);
          if (item) {
            const reply = typeof hr.reply === "string" && hr.reply.trim() ? ` (${hr.reply.trim()})` : "";
            if (hr.action === "accepted") { item.status = "accepted"; item.respondedAt = now; item.reply = hr.reply?.trim() || undefined; addNote(`${item.to} heeft de hulpvraag van ${item.from} geaccepteerd: ${item.message}${reply}`); }
            if (hr.action === "declined") { item.status = "declined"; item.respondedAt = now; item.reply = hr.reply?.trim() || undefined; addNote(`${item.to} kan niet helpen met: ${item.message}${reply}`); }
            if (hr.action === "done") { item.status = "done"; item.doneAt = now; addNote(`Hulpvraag afgerond (${item.to}): ${item.message}`); }
            if (hr.action === "cancel") { item.status = "cancelled"; item.respondedAt = now; addNote(`Hulpvraag aan ${item.to} ingetrokken: ${item.message}`); }
          }
        }
        (order as any).helpRequests = list.slice(-50);
      }

      if (assignedStaff !== undefined) {
        order.assignedStaff = assignedStaff;
        order.history.push({
          date: new Date().toISOString(),
          status: status || order.status || "Toegewezen",
          note: assignedStaff
            ? `Order toegewezen aan medewerker: ${assignedStaff}.`
            : "Toewijzing van order ingetrokken.",
          internal: true
        });
      }
      // Wie deed het? Alleen zichtbaar in de backoffice, nooit voor de klant.
      for (let index = historyStart; index < order.history.length; index += 1) (order.history[index] as any).by = actor;
    });

    if (!updated) {
      return res.status(404).json({ error: "Order not found." });
    }
    return res.json({ success: true, order: serializeAdminOrder(updated) });
  }));

  // Concept-uploads: tijdens het maken van een opdrachtbon scant de klant een QR-code en stuurt het
  // bestand vanaf de telefoon naar de balie, nog voordat de bon is opgeslagen. Blijft 8 uur bewaard.
  const DRAFT_TTL_MS = 8 * 60 * 60 * 1000;
  const DRAFT_TOKEN = /^[a-f0-9]{48}$/;

  async function readDraft(token: string) {
    if (!DRAFT_TOKEN.test(token)) return null;
    const raw = await storage.getMeta(`draft:${token}`);
    if (!raw) return null;
    try {
      const draft = JSON.parse(raw);
      if (typeof draft?.createdAt !== "number" || Date.now() - draft.createdAt > DRAFT_TTL_MS) {
        await storage.setMeta(`draft:${token}`, "");
        return null;
      }
      return draft;
    } catch {
      return null;
    }
  }

  app.post("/api/ticket-drafts", rateLimit(30), asyncRoute(async (req, res) => {
    const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "");
    const size = (value: unknown) => {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 && number < 100000 ? number : null;
    };
    const token = crypto.randomBytes(24).toString("hex");
    const draft = {
      createdAt: Date.now(),
      description: clean(req.body?.description, 200),
      widthMm: size(req.body?.widthMm),
      heightMm: size(req.body?.heightMm)
    };
    await storage.setMeta(`draft:${token}`, JSON.stringify(draft));
    return res.json({ token, expiresAt: draft.createdAt + DRAFT_TTL_MS });
  }));

  app.get("/api/public/ticket-drafts/:token", asyncRoute(async (req, res) => {
    const draft = await readDraft(req.params.token);
    if (!draft) return res.status(404).json({ error: "Deze uploadlink is verlopen of bestaat niet." });
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      description: draft.description,
      widthMm: draft.widthMm,
      heightMm: draft.heightMm,
      expiresAt: draft.createdAt + DRAFT_TTL_MS,
      file: draft.file ? { fileName: draft.file.fileName, fileType: draft.file.fileType, size: draft.file.size, uploadedAt: draft.file.uploadedAt } : null
    });
  }));

  app.post("/api/public/ticket-drafts/:token/file", rateLimit(10), asyncRoute(async (req, res) => {
    const draft = await readDraft(req.params.token);
    if (!draft) return res.status(404).json({ error: "Deze uploadlink is verlopen of bestaat niet." });
    const file = validateCustomerFile(req.body?.file);
    if (!file) return res.status(400).json({ error: "Upload een geldig PDF-, PNG- of JPG-bestand van maximaal 20 MB." });
    draft.file = { ...file, uploadedAt: new Date().toISOString() };
    await storage.setMeta(`draft:${req.params.token}`, JSON.stringify(draft));
    return res.json({ success: true });
  }));

  app.get("/api/public/ticket-drafts/:token/file", asyncRoute(async (req, res) => {
    const draft = await readDraft(req.params.token);
    if (!draft?.file) return res.status(404).json({ error: "Nog geen bestand ontvangen." });
    const match = /^data:[^;]+;base64,(.+)$/.exec(draft.file.dataUrl);
    if (!match) return res.status(404).json({ error: "Bestand niet beschikbaar." });
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", draft.file.fileType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-File-Name", encodeURIComponent(draft.file.fileName));
    return res.send(Buffer.from(match[1], "base64"));
  }));

  app.delete("/api/public/ticket-drafts/:token/file", rateLimit(30), asyncRoute(async (req, res) => {
    const draft = await readDraft(req.params.token);
    if (!draft) return res.status(404).json({ error: "Deze uploadlink is verlopen of bestaat niet." });
    delete draft.file;
    await storage.setMeta(`draft:${req.params.token}`, JSON.stringify(draft));
    return res.json({ success: true });
  }));

  app.post("/api/public/orders/:uploadToken/product-files", rateLimit(10), asyncRoute(async (req, res) => {
    const uploadToken = req.params.uploadToken;
    if (!/^[a-f0-9]{48}$/.test(uploadToken)) {
      return res.status(404).json({ error: "Product upload link not found." });
    }

    const file = validateCustomerFile(req.body?.file);
    // Bij het maken van de opdrachtbon wordt het origineel bewaard en eventueel ook de op maat gezette versie (pre-press check).
    const processed = req.body?.processed ? validateCustomerFile(req.body.processed) : null;
    if (req.body?.processed && (!processed || processed.fileType !== "application/pdf")) {
      return res.status(400).json({ error: "Het op maat gezette bestand is ongeldig." });
    }
    const prepressNote = cleanNote(req.body?.prepressNote);
    const prepressBleed = cleanBleed(req.body?.prepressBleedMm);
    const existing = await storage.findOrderByUploadToken(uploadToken);
    if (!existing || !findProductUpload(existing, uploadToken)) {
      return res.status(404).json({ error: "Product upload link not found." });
    }
    if (!file) {
      return res.status(400).json({ error: "Upload een geldig PDF-, PNG- of JPG-bestand van maximaal 20 MB." });
    }

    let productUpload: any;
    let limitReached = false;
    const updated = await storage.updateOrder(existing.id, (order) => {
      productUpload = findProductUpload(order, uploadToken);
      if (!productUpload) return false;

      const customerFiles = Array.isArray(order.customerFiles) ? order.customerFiles : [];
      if (customerFiles.filter((item: any) => item.productLineId === productUpload.id).length >= 20) {
        limitReached = true;
        return false;
      }

      const fileId = crypto.randomBytes(12).toString("hex");
      const processedId = processed ? crypto.randomBytes(12).toString("hex") : "";
      const uploadedAt = new Date().toISOString();
      order.customerFiles = [...customerFiles, {
        id: fileId,
        fileName: file.fileName,
        fileType: file.fileType,
        size: file.size,
        side: "product",
        productLineId: productUpload.id,
        productName: productUpload.description,
        productQuantity: productUpload.quantity,
        uploadedAt,
        ...(processed || prepressNote ? { prepress: { ok: !/aandachtspunten/i.test(prepressNote), note: prepressNote, bleedMm: prepressBleed, by: "Bij het maken van de bon", at: uploadedAt, ...(processed ? { processedId } : { useOriginal: true }) } } : {})
      }];
      if (processed) {
        (order as any).extraFiles = [...(Array.isArray((order as any).extraFiles) ? (order as any).extraFiles : []), { id: processedId, fileName: processed.fileName, fileType: processed.fileType, size: processed.size, label: "Pre-press: op maat gezet", by: "Bij het maken van de bon", uploadedAt, prepressOf: fileId }];
      }
      order.status = "Bestanden Ontvangen";
      order.history = Array.isArray(order.history) ? order.history : [];
      order.history.push({
        date: uploadedAt,
        status: "Bestanden Ontvangen",
        note: `Klant heeft ${file.fileName} aangeleverd voor ${productUpload.description} (${productUpload.quantity} stuks).`
      });

      const newFile: NewFile = { id: fileId, fileName: file.fileName, fileType: file.fileType, dataUrl: file.dataUrl };
      const addFiles: NewFile[] = [newFile];
      if (processed) addFiles.push({ id: processedId, fileName: processed.fileName, fileType: processed.fileType, dataUrl: processed.dataUrl });
      return { addFiles };
    });

    if (limitReached) {
      return res.status(400).json({ error: "Voor dit product zijn al 20 bestanden ontvangen." });
    }
    if (!updated || !productUpload) {
      return res.status(404).json({ error: "Product upload link not found." });
    }
    return res.json({
      success: true,
      order: serializePublicOrder(updated, productUpload)
    });
  }));

  app.post("/api/public/orders/:trackingToken/update-file", rateLimit(10), asyncRoute(async (req, res) => {
    const { side, imageSrcUrl, fileName, dpi, pixelWidth, pixelHeight } = req.body || {};
    if (!/^[a-f0-9]{48}$/.test(req.params.trackingToken)) {
      return res.status(404).json({ error: "Order not found." });
    }
    const existing = await storage.findOrderByTrackingToken(req.params.trackingToken);
    if (!existing) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (!isValidInlineImage(imageSrcUrl) || typeof imageSrcUrl !== "string" || !fileName || typeof fileName !== "string" || fileName.length > 255 || !["front", "back"].includes(side) || !Number.isInteger(pixelWidth) || pixelWidth < 1 || pixelWidth > 30000 || !Number.isInteger(pixelHeight) || pixelHeight < 1 || pixelHeight > 30000 || typeof dpi !== "number" || !Number.isFinite(dpi) || dpi < 1 || dpi > 10000) {
      return res.status(400).json({ error: "Invalid file payload." });
    }

    const sourceFile = req.body?.sourceFile === undefined ? null : validateCustomerFile(req.body.sourceFile);
    if (req.body?.sourceFile !== undefined && !sourceFile) {
      return res.status(400).json({ error: "The original file is invalid or exceeds the 20 MB limit." });
    }

    const updated = await storage.updateOrder(existing.id, (order) => {
      if (side === "front") {
        order.imageSrcUrl = imageSrcUrl;
        order.frontFileName = fileName;
        order.frontComputedDpi = dpi;
        order.frontPixelWidth = pixelWidth;
        order.frontPixelHeight = pixelHeight;
      } else {
        order.backImageSrcUrl = imageSrcUrl;
        order.backFileName = fileName;
        order.backComputedDpi = dpi;
        order.backPixelWidth = pixelWidth;
        order.backPixelHeight = pixelHeight;
      }

      const changes: { addFiles: NewFile[]; removeFileIds: string[] } = { addFiles: [], removeFileIds: [] };
      if (sourceFile) {
        const customerFiles = Array.isArray(order.customerFiles) ? order.customerFiles : [];
        const fileId = crypto.randomBytes(12).toString("hex");
        changes.removeFileIds = customerFiles.filter((file: any) => file.side === side).map((file: any) => file.id);
        changes.addFiles = [{ id: fileId, fileName: sourceFile.fileName, fileType: sourceFile.fileType, dataUrl: sourceFile.dataUrl }];
        order.customerFiles = [
          ...customerFiles.filter((file: any) => file.side !== side),
          {
            id: fileId,
            fileName: sourceFile.fileName,
            fileType: sourceFile.fileType,
            size: sourceFile.size,
            side,
            uploadedAt: new Date().toISOString()
          }
        ];
      }

      order.status = "Bestanden Gewijzigd";
      order.history = Array.isArray(order.history) ? order.history : [];
      order.history.push({
        date: new Date().toISOString(),
        status: "Bestanden Gewijzigd",
        note: `Klant heeft nieuwe bestanden geüpload voor de ${side === "front" ? "Voorkant (A-zijde)" : "Achterkant (B-zijde)"} (${fileName}).`
      });
      return changes;
    });

    if (!updated) {
      return res.status(404).json({ error: "Order not found." });
    }
    return res.json({ success: true, order: serializePublicOrder(updated) });
  }));

  app.delete("/api/orders/:id", requireAdmin, asyncRoute(async (req, res) => {
    await storage.deleteOrder(req.params.id);
    res.json({ success: true });
  }));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.get("/orders", async (req, res, next) => {
      try {
        const template = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).type("html").send(html);
      } catch (error) {
        next(error);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(`[error] ${req.method} ${req.path}:`, error);
    if (res.headersSent) return;
    res.status(500).json({ error: "Er ging iets mis op de server. Probeer het opnieuw." });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Full-Stack] Server booted successfully on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("[startup] Server kon niet starten:", error);
  process.exit(1);
});
