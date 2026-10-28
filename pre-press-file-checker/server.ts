import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const AUTH_RATE_LIMIT_MAX_REQUESTS = 20;

const adminSessions = new Map<string, { expiresAt: number }>();
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

function createAdminSession() {
  const now = Date.now();
  for (const [sessionId, session] of adminSessions) {
    if (session.expiresAt <= now) adminSessions.delete(sessionId);
  }
  while (adminSessions.size >= 10000) {
    const oldestSessionId = adminSessions.keys().next().value;
    if (!oldestSessionId) break;
    adminSessions.delete(oldestSessionId);
  }
  const sessionId = crypto.randomBytes(32).toString("hex");
  adminSessions.set(sessionId, { expiresAt: now + ADMIN_SESSION_TTL_MS });
  return sessionId;
}

function getAdminSession(req: express.Request) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.fd_admin_session;
  if (!sessionId) return null;

  const session = adminSessions.get(sessionId);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    adminSessions.delete(sessionId);
    return null;
  }

  session.expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  return sessionId;
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    return res.status(503).json({ error: "Admin authentication is not configured." });
  }

  if (!getAdminSession(req)) {
    return res.status(401).json({ error: "Not authorized." });
  }

  return next();
}

async function startServer() {
  const app = express();

  ensureAdminPasswordConfigured();
  app.disable("x-powered-by");
  app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
  app.use(applySecurityHeaders);
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ limit: "32kb", extended: true }));
  app.use("/api", rateLimit(RATE_LIMIT_MAX_REQUESTS));
  app.use("/api", requireSameOrigin);

  const ORDERS_FILE = path.join(process.cwd(), "orders.json");

  function loadOrders() {
    try {
      if (fs.existsSync(ORDERS_FILE)) {
        const raw = fs.readFileSync(ORDERS_FILE, "utf-8");
        const orders = JSON.parse(raw);
        if (!Array.isArray(orders)) return [];

        let changed = false;
        for (const order of orders) {
          if (!/^[a-f0-9]{48}$/.test(String(order.trackingToken || ""))) {
            order.trackingToken = crypto.randomBytes(24).toString("hex");
            changed = true;
          }
        }
        if (changed) saveOrders(orders);
        return orders;
      }
    } catch (e) {
      console.error("Error reading orders database:", e);
    }
    return [];
  }

  function saveOrders(orders: any[]) {
    try {
      const temporaryFile = `${ORDERS_FILE}.tmp`;
      fs.writeFileSync(temporaryFile, JSON.stringify(orders, null, 2), { encoding: "utf-8", mode: 0o600 });
      fs.renameSync(temporaryFile, ORDERS_FILE);
    } catch (e) {
      console.error("Error saving orders database:", e);
      throw e;
    }
  }

  const STAFF_FILE = path.join(process.cwd(), "staff.json");

  function loadStaff() {
    try {
      if (fs.existsSync(STAFF_FILE)) {
        const raw = fs.readFileSync(STAFF_FILE, "utf-8");
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error("Error reading staff database:", e);
    }
    return [
      { id: "S1", name: "Jan de Wilde", role: "Pre-press Specialist" },
      { id: "S2", name: "Sara Bakker", role: "Order Manager" },
      { id: "S3", name: "Mo El Hamdi", role: "Druk Operator" }
    ];
  }

  function saveStaff(staff: any[]) {
    try {
      fs.writeFileSync(STAFF_FILE, JSON.stringify(staff, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving staff database:", e);
    }
  }

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

  function serializePublicOrder(order: any) {
    const result: Record<string, unknown> = {};
    publicOrderFields.forEach((field) => {
      if (field in order) result[field] = order[field];
    });
    result.hasDesignFile = Boolean(order.imageSrcUrl);
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
    "order_type", "order_number", "contact_person", "delivery_date", "delivery_method", "delivery_address",
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
      "order_type", "order_number", "contact_person", "delivery_date", "delivery_method", "delivery_address",
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
          product.unitPrice > 100000
        )) return null;
      } catch {
        return null;
      }
    }
    if ((safeData.customWidth !== undefined && Number(safeData.customWidth) <= 0) || (safeData.customHeight !== undefined && Number(safeData.customHeight) <= 0)) return null;
    safeData.clientName = data.clientName.trim();
    safeData.clientEmail = data.clientEmail.trim().toLowerCase();
    return safeData;
  }

  function createOrder(data: any, assignedStaff?: string, allowTicketFields = false) {
    const safeData = sanitizeOrderData(data, allowTicketFields);
    if (!safeData) return null;

    const now = new Date().toISOString();
    const order = {
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

    const orders = loadOrders();
    orders.unshift(order);
    saveOrders(orders);
    return order;
  }

  app.post("/api/auth/login", rateLimit(AUTH_RATE_LIMIT_MAX_REQUESTS), (req, res) => {
    if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
      return res.status(503).json({ error: "Admin auth is not configured." });
    }

    const submittedPassword = typeof req.body?.password === "string" ? req.body.password : "";
    if (!safeCompare(submittedPassword, ADMIN_PASSWORD)) {
      return res.status(401).json({ error: "Invalid password." });
    }

    const sessionId = createAdminSession();
    res.cookie("fd_admin_session", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_MS,
    });

    return res.json({ ok: true });
  });

  app.post("/api/auth/logout", (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.fd_admin_session;
    if (sessionId) {
      adminSessions.delete(sessionId);
    }

    res.clearCookie("fd_admin_session", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    return res.json({ ok: true });
  });

  app.get("/api/auth/session", (req, res) => {
    const authenticated = Boolean(getAdminSession(req));
    return res.json({ authenticated });
  });

  app.get("/api/staff", requireAdmin, (req, res) => {
    res.json(loadStaff());
  });

  app.post("/api/staff", requireAdmin, (req, res) => {
    const { name, role } = req.body;
    if (!name || !role) {
      return res.status(400).json({ error: "Naam en rol zijn verplicht." });
    }
    const staff = loadStaff();
    const newMember = {
      id: "S-" + Math.floor(1000 + Math.random() * 9000),
      name,
      role
    };
    staff.push(newMember);
    saveStaff(staff);
    res.json(newMember);
  });

  app.delete("/api/staff/:id", requireAdmin, (req, res) => {
    const staff = loadStaff();
    const filtered = staff.filter((m: any) => m.id !== req.params.id);
    saveStaff(filtered);
    res.json({ success: true });
  });

  app.get("/api/orders", requireAdmin, (req, res) => {
    res.json(loadOrders());
  });

  app.get("/api/admin/orders", requireAdmin, (req, res) => {
    res.json(loadOrders());
  });

  app.get("/api/orders/:id", requireAdmin, (req, res) => {
    const orders = loadOrders();
    const order = orders.find((o: any) => o.id === req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }
    res.json(order);
  });

  app.get("/api/public/orders/:trackingToken", (req, res) => {
    if (!/^[a-f0-9]{48}$/.test(req.params.trackingToken)) {
      return res.status(404).json({ error: "Order not found." });
    }
    const orders = loadOrders();
    const order = orders.find((o: any) => o.trackingToken === req.params.trackingToken);
    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }
    return res.json(serializePublicOrder(order));
  });

  app.post("/api/orders", rateLimit(10), (req, res) => {
    const { orderData } = req.body;
    const order = createOrder(orderData);
    if (!order) return res.status(400).json({ error: "Invalid order data." });
    return res.status(201).json({ success: true, orderId: order.id, trackingToken: order.trackingToken });
  });

  app.post("/api/admin/orders", requireAdmin, (req, res) => {
    const orderData = req.body?.orderData;
    const assignedStaff = typeof orderData?.assignedStaff === "string" ? orderData.assignedStaff.trim() : "";
    const staffExists = !assignedStaff || loadStaff().some((member: any) => member.name === assignedStaff);
    if (!staffExists) return res.status(400).json({ error: "Invalid staff assignment." });
    const order = createOrder(orderData, assignedStaff || undefined, true);
    if (!order) return res.status(400).json({ error: "Invalid order data." });
    return res.status(201).json({ success: true, orderId: order.id, trackingToken: order.trackingToken });
  });

  app.put("/api/orders/:id", requireAdmin, (req, res) => {
    const { status, note, assignedStaff } = req.body;
    const orderId = req.params.id;
    const orders = loadOrders();
    const idx = orders.findIndex((o: any) => o.id === orderId);

    if (idx === -1) {
      return res.status(404).json({ error: "Order not found." });
    }

    const oldStatus = orders[idx].status || "Ingediend";
    if (status) {
      orders[idx].status = status;
      orders[idx].history = orders[idx].history || [];
      orders[idx].history.push({
        date: new Date().toISOString(),
        status,
        note: note || `Status gewijzigd van ${oldStatus} naar ${status}.`
      });
    }

    if (assignedStaff !== undefined) {
      orders[idx].assignedStaff = assignedStaff;
      orders[idx].history = orders[idx].history || [];
      orders[idx].history.push({
        date: new Date().toISOString(),
        status: status || orders[idx].status || "Toegewezen",
        note: assignedStaff
          ? `Order toegewezen aan medewerker: ${assignedStaff}.`
          : "Toewijzing van order ingetrokken."
      });
    }

    saveOrders(orders);
    return res.json({ success: true, order: orders[idx] });
  });

  app.post("/api/public/orders/:trackingToken/update-file", rateLimit(10), (req, res) => {
    const { side, imageSrcUrl, fileName, dpi, pixelWidth, pixelHeight } = req.body;
    if (!/^[a-f0-9]{48}$/.test(req.params.trackingToken)) {
      return res.status(404).json({ error: "Order not found." });
    }
    const orders = loadOrders();
    const order = orders.find((o: any) => o.trackingToken === req.params.trackingToken);

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (!isValidInlineImage(imageSrcUrl) || typeof imageSrcUrl !== "string" || !fileName || typeof fileName !== "string" || fileName.length > 255 || !["front", "back"].includes(side) || !Number.isInteger(pixelWidth) || pixelWidth < 1 || pixelWidth > 30000 || !Number.isInteger(pixelHeight) || pixelHeight < 1 || pixelHeight > 30000 || typeof dpi !== "number" || !Number.isFinite(dpi) || dpi < 1 || dpi > 10000) {
      return res.status(400).json({ error: "Invalid file payload." });
    }

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

    order.status = "Bestanden Gewijzigd";
    order.history = order.history || [];
    order.history.push({
      date: new Date().toISOString(),
      status: "Bestanden Gewijzigd",
      note: `Klant heeft nieuwe bestanden geüpload voor de ${side === "front" ? "Voorkant (A-zijde)" : "Achterkant (B-zijde)"} (${fileName}).`
    });

    saveOrders(orders.map((item: any) => (item.id === order.id ? order : item)));
    return res.json({ success: true, order: serializePublicOrder(order) });
  });

  app.delete("/api/orders/:id", requireAdmin, (req, res) => {
    const orderId = req.params.id;
    let orders = loadOrders();
    orders = orders.filter((o: any) => o.id !== orderId);
    saveOrders(orders);
    res.json({ success: true });
  });

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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Full-Stack] Server booted successfully on http://0.0.0.0:${PORT}`);
  });
}

startServer();
