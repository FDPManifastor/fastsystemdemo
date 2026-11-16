import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { createStorage, type NewFile, type Order } from "./storage";
import { createCatalog } from "./catalog";
import { createProjectMap } from "./projectMap";

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
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

async function createAdminSession() {
  const sessionId = crypto.randomBytes(32).toString("hex");
  await storage.createSession(sessionId, Date.now() + ADMIN_SESSION_TTL_MS);
  return sessionId;
}

async function getAdminSession(req: express.Request) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.fd_admin_session;
  if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return null;

  const valid = await storage.touchSession(sessionId, Date.now() + ADMIN_SESSION_TTL_MS);
  return valid ? sessionId : null;
}

type AsyncHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>;

function asyncRoute(handler: AsyncHandler): express.RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

const requireAdmin = asyncRoute(async (req, res, next) => {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    return res.status(503).json({ error: "Admin authentication is not configured." });
  }

  if (!(await getAdminSession(req))) {
    return res.status(401).json({ error: "Not authorized." });
  }

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

    result.hasDesignFile = Boolean(order.imageSrcUrl);
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
    "backPixelWidth", "backPixelHeight", "frontComputedDpi", "backComputedDpi"
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
    if (bytes.length === 0 || bytes.length > 4 * 1024 * 1024) return null;
    if (value.fileType === "application/pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) return null;
    if (value.fileType === "image/png" && !bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
    if (value.fileType === "image/jpeg" && (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)) return null;

    return { fileName, fileType: value.fileType, dataUrl: value.dataUrl, size: bytes.length };
  }

  function sanitizeOrderData(data: any, allowTicketFields = false) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    if (typeof data.clientName !== "string" || !data.clientName.trim() || data.clientName.length > 200) return null;
    if (typeof data.clientEmail !== "string" || data.clientEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.clientEmail)) return null;
    if (!isValidInlineImage(data.imageSrcUrl) || !isValidInlineImage(data.backImageSrcUrl)) return null;

    const safeData: Record<string, unknown> = {};
    for (const field of allowTicketFields ? [...allowedOrderFields, ...ticketOrderFields] : allowedOrderFields) {
      if (data[field] !== undefined) safeData[field] = data[field];
    }

    for (const field of [
      "clientPhone", "clientReference", "clientComments", "selectedProductId", "selectedProductName",
      "selectedProductCategory", "frontFileName", "backFileName", "frontFitMode", "backFitMode",
      "order_type", "order_number", "contact_person", "client_address", "client_postcode_city", "delivery_date", "delivery_method", "delivery_address",
      "assisted_by", "order_status", "payment_status", "products_json", "notes", "internal_notes"
    ]) {
      const maxLength = field === "products_json" ? 50000 : 2000;
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
    if ((safeData.customWidth !== undefined && Number(safeData.customWidth) <= 0) || (safeData.customHeight !== undefined && Number(safeData.customHeight) <= 0)) return null;
    safeData.clientName = data.clientName.trim();
    safeData.clientEmail = data.clientEmail.trim().toLowerCase();
    return safeData;
  }

  function findProductUpload(order: Order, uploadToken: string) {
    if (order.order_type !== "opdrachtbon" || typeof order.products_json !== "string") return undefined;
    try {
      return JSON.parse(order.products_json).find((product: any) => product.uploadToken === uploadToken);
    } catch {
      return undefined;
    }
  }

  async function createOrder(data: any, assignedStaff?: string, allowTicketFields = false) {
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
      trackingToken: crypto.randomBytes(24).toString("hex"),
      createdAt: now,
      status: "Ingediend",
      history: [{
        date: now,
        status: "Ingediend",
        note: "Uw preflight-gevalideerde opdracht is ontvangen en staat in de wachtrij van FD Printing."
      }]
    };

    await storage.insertOrder(order);
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
    if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
      return res.status(503).json({ error: "Admin auth is not configured." });
    }

    const submittedPassword = typeof req.body?.password === "string" ? req.body.password : "";
    if (!safeCompare(submittedPassword, ADMIN_PASSWORD)) {
      return res.status(401).json({ error: "Invalid password." });
    }

    const sessionId = await createAdminSession();
    res.cookie("fd_admin_session", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_MS,
    });

    return res.json({ ok: true });
  }));

  app.post("/api/auth/logout", asyncRoute(async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.fd_admin_session;
    if (sessionId) {
      await storage.deleteSession(sessionId);
    }

    res.clearCookie("fd_admin_session", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    return res.json({ ok: true });
  }));

  app.get("/api/auth/session", asyncRoute(async (req, res) => {
    const authenticated = Boolean(await getAdminSession(req));
    return res.json({ authenticated });
  }));

  app.get("/api/staff", requireAdmin, asyncRoute(async (req, res) => {
    res.json(await storage.listStaff());
  }));

  app.post("/api/staff", requireAdmin, asyncRoute(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const role = typeof req.body?.role === "string" ? req.body.role.trim() : "";
    if (!name || !role || name.length > 200 || role.length > 200) {
      return res.status(400).json({ error: "Naam en rol zijn verplicht." });
    }
    const newMember = {
      id: `S-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      name,
      role
    };
    await storage.addStaff(newMember);
    res.json(newMember);
  }));

  app.delete("/api/staff/:id", requireAdmin, asyncRoute(async (req, res) => {
    await storage.deleteStaff(req.params.id);
    res.json({ success: true });
  }));

  app.get("/api/orders", requireAdmin, asyncRoute(async (req, res) => {
    res.json((await storage.listOrders()).map(serializeAdminOrder));
  }));

  app.get("/api/admin/orders", requireAdmin, asyncRoute(async (req, res) => {
    res.json((await storage.listOrders()).map(serializeAdminOrder));
  }));

  app.get("/api/orders/:id", requireAdmin, asyncRoute(async (req, res) => {
    const order = await storage.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }
    res.json(serializeAdminOrder(order));
  }));

  app.get("/api/orders/:id/files/:fileId", requireAdmin, asyncRoute(async (req, res) => {
    if (!/^[a-f0-9]{24}$/.test(req.params.fileId)) {
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
      if (
        typeof orderData.order_number !== "string" ||
        typeof orderData.products_json !== "string" ||
        typeof orderData.grand_total !== "number" ||
        !Number.isFinite(orderData.grand_total)
      ) {
        return res.status(400).json({ error: "Invalid order data." });
      }

      const ticketOrder = {
        ...orderData,
        order_status: "Nieuw",
        payment_status: "Niet betaald",
        prepayment: 0,
        remaining: orderData.grand_total,
        customer_approved: false,
        assisted_by: typeof orderData.assisted_by === "string" ? orderData.assisted_by.trim().slice(0, 200) : "",
        internal_notes: "",
      };
      const created = await createOrder(ticketOrder, undefined, true);
      if (!created) return res.status(400).json({ error: "Invalid order data." });
      return res.status(201).json({
        success: true,
        orderId: created.order.id,
        trackingToken: created.order.trackingToken,
        productUploadLinks: created.productUploadLinks
      });
    }

    const created = await createOrder(orderData);
    if (!created) return res.status(400).json({ error: "Invalid order data." });
    return res.status(201).json({ success: true, orderId: created.order.id, trackingToken: created.order.trackingToken });
  }));

  app.post("/api/admin/orders", requireAdmin, asyncRoute(async (req, res) => {
    const orderData = req.body?.orderData;
    const assignedStaff = typeof orderData?.assignedStaff === "string" ? orderData.assignedStaff.trim() : "";
    const staffExists = !assignedStaff || (await storage.listStaff()).some((member) => member.name === assignedStaff);
    if (!staffExists) return res.status(400).json({ error: "Invalid staff assignment." });
    const created = await createOrder(orderData, assignedStaff || undefined, true);
    if (!created) return res.status(400).json({ error: "Invalid order data." });
    return res.status(201).json({
      success: true,
      orderId: created.order.id,
      trackingToken: created.order.trackingToken,
      productUploadLinks: created.productUploadLinks
    });
  }));

  app.put("/api/orders/:id", requireAdmin, asyncRoute(async (req, res) => {
    const { status, note, assignedStaff } = req.body || {};
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
      if (status) {
        order.status = status;
        order.history.push({
          date: new Date().toISOString(),
          status,
          note: note || `Status gewijzigd van ${oldStatus} naar ${status}.`
        });
      }

      if (assignedStaff !== undefined) {
        order.assignedStaff = assignedStaff;
        order.history.push({
          date: new Date().toISOString(),
          status: status || order.status || "Toegewezen",
          note: assignedStaff
            ? `Order toegewezen aan medewerker: ${assignedStaff}.`
            : "Toewijzing van order ingetrokken."
        });
      }
    });

    if (!updated) {
      return res.status(404).json({ error: "Order not found." });
    }
    return res.json({ success: true, order: serializeAdminOrder(updated) });
  }));

  app.post("/api/public/orders/:uploadToken/product-files", rateLimit(10), asyncRoute(async (req, res) => {
    const uploadToken = req.params.uploadToken;
    if (!/^[a-f0-9]{48}$/.test(uploadToken)) {
      return res.status(404).json({ error: "Product upload link not found." });
    }

    const file = validateCustomerFile(req.body?.file);
    const existing = await storage.findOrderByUploadToken(uploadToken);
    if (!existing || !findProductUpload(existing, uploadToken)) {
      return res.status(404).json({ error: "Product upload link not found." });
    }
    if (!file) {
      return res.status(400).json({ error: "Upload een geldig PDF-, PNG- of JPG-bestand van maximaal 4 MB." });
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
        uploadedAt
      }];
      order.status = "Bestanden Ontvangen";
      order.history = Array.isArray(order.history) ? order.history : [];
      order.history.push({
        date: uploadedAt,
        status: "Bestanden Ontvangen",
        note: `Klant heeft ${file.fileName} aangeleverd voor ${productUpload.description} (${productUpload.quantity} stuks).`
      });

      const newFile: NewFile = { id: fileId, fileName: file.fileName, fileType: file.fileType, dataUrl: file.dataUrl };
      return { addFiles: [newFile] };
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
      return res.status(400).json({ error: "The original file is invalid or exceeds the 4 MB limit." });
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
