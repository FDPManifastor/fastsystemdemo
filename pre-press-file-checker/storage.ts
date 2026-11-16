import fs from "fs";
import path from "path";
import crypto from "crypto";
import pg from "pg";

/**
 * Opslaglaag voor orders, klantbestanden, medewerkers en admin-sessies.
 *
 * - Met DATABASE_URL (Neon/Postgres): alles blijft bewaard, ook na deploys en herstarts.
 * - Zonder DATABASE_URL (lokaal ontwikkelen): data in local-data.json in de werkmap.
 *
 * Orders worden als JSON-document opgeslagen; de bestandsinhoud van klantuploads staat
 * apart, zodat het orderoverzicht snel blijft.
 */

export type Order = Record<string, any>;
export type StaffMember = { id: string; name: string; role: string };
export type NewFile = { id: string; fileName: string; fileType: string; dataUrl: string };
export type StoredFileData = { fileName: string; fileType: string; data: Buffer };
export type OrderChanges = { addFiles?: NewFile[]; removeFileIds?: string[] };

export interface Storage {
  kind: "postgres" | "local-file";
  init(): Promise<void>;
  ping(): Promise<void>;
  listOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  findOrderByTrackingToken(token: string): Promise<Order | null>;
  findOrderByUploadToken(token: string): Promise<Order | null>;
  insertOrder(order: Order, changes?: OrderChanges): Promise<void>;
  /** Leest de order, laat `mutate` hem aanpassen en slaat hem atomair op. Return `false` om af te breken. */
  updateOrder(id: string, mutate: (order: Order) => OrderChanges | void | false | Promise<OrderChanges | void | false>): Promise<Order | null>;
  deleteOrder(id: string): Promise<boolean>;
  getFile(orderId: string, fileId: string): Promise<StoredFileData | null>;
  listStaff(): Promise<StaffMember[]>;
  addStaff(member: StaffMember): Promise<void>;
  deleteStaff(id: string): Promise<void>;
  createSession(sessionId: string, expiresAt: number): Promise<void>;
  /** Geeft true als de sessie geldig is en verlengt hem dan tot `newExpiresAt`. */
  touchSession(sessionId: string, newExpiresAt: number): Promise<boolean>;
  deleteSession(sessionId: string): Promise<void>;
}

const DEFAULT_STAFF: StaffMember[] = [
  { id: "S1", name: "Jan de Wilde", role: "Pre-press Specialist" },
  { id: "S2", name: "Sara Bakker", role: "Order Manager" },
  { id: "S3", name: "Mo El Hamdi", role: "Druk Operator" },
];

const DATA_URL_PATTERN = /^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;

function hashSessionId(sessionId: string) {
  return crypto.createHash("sha256").update(sessionId).digest("hex");
}

export function getUploadTokens(order: Order): string[] {
  if (order.order_type !== "opdrachtbon" || typeof order.products_json !== "string") return [];
  try {
    const products = JSON.parse(order.products_json);
    return Array.isArray(products)
      ? products.map((product: any) => product?.uploadToken).filter((token: unknown): token is string => typeof token === "string")
      : [];
  } catch {
    return [];
  }
}

/** Haalt de inline bestandsdata (dataUrl) uit een order uit de oude orders.json. */
function splitLegacyFiles(order: Order): { order: Order; files: NewFile[] } {
  const files: NewFile[] = [];
  if (Array.isArray(order.customerFiles)) {
    order.customerFiles = order.customerFiles.map((file: any) => {
      const { dataUrl, ...meta } = file || {};
      if (typeof dataUrl === "string" && typeof meta.id === "string") {
        files.push({ id: meta.id, fileName: meta.fileName, fileType: meta.fileType, dataUrl });
      }
      return meta;
    });
  }
  return { order, files };
}

function readLegacyJson(fileName: string): any {
  const filePath = path.join(process.cwd(), fileName);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(`[storage] Kon ${fileName} niet lezen:`, error);
    return null;
  }
}

function decodeDataUrl(dataUrl: string): { fileType: string; data: Buffer } | null {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) return null;
  return { fileType: match[1], data: Buffer.from(match[2], "base64") };
}

/* ------------------------------------------------------------------ */
/* Postgres (Neon)                                                     */
/* ------------------------------------------------------------------ */

class PostgresStorage implements Storage {
  kind = "postgres" as const;
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
    this.pool.on("error", (error) => console.error("[storage] Postgres-verbinding fout:", error));
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        tracking_token TEXT NOT NULL UNIQUE,
        upload_tokens TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        data JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS orders_upload_tokens_idx ON orders USING GIN (upload_tokens);
      CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);

      CREATE TABLE IF NOT EXISTS order_files (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL,
        data BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS order_files_order_id_idx ON order_files (order_id);

      CREATE TABLE IF NOT EXISTS staff (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        id_hash TEXT PRIMARY KEY,
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    await this.seedOnce("staff_seeded", async (client) => {
      const legacyStaff = readLegacyJson("staff.json");
      const staff: StaffMember[] = Array.isArray(legacyStaff) && legacyStaff.length ? legacyStaff : DEFAULT_STAFF;
      for (const member of staff) {
        await client.query(
          "INSERT INTO staff (id, name, role) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
          [String(member.id), String(member.name), String(member.role)]
        );
      }
    });

    await this.seedOnce("legacy_orders_imported", async (client) => {
      const legacyOrders = readLegacyJson("orders.json");
      if (!Array.isArray(legacyOrders) || legacyOrders.length === 0) return;
      for (const rawOrder of legacyOrders) {
        if (!rawOrder?.id || !rawOrder?.trackingToken) continue;
        const { order, files } = splitLegacyFiles(rawOrder);
        await this.writeOrder(client, order, true);
        await this.writeFiles(client, order.id, { addFiles: files });
      }
      console.log(`[storage] ${legacyOrders.length} order(s) uit orders.json overgezet naar de database.`);
    });

    await this.pool.query("DELETE FROM admin_sessions WHERE expires_at < now()");
  }

  private async seedOnce(key: string, run: (client: pg.PoolClient) => Promise<void>) {
    await this.transaction(async (client) => {
      const inserted = await client.query(
        "INSERT INTO app_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING RETURNING key",
        [key, new Date().toISOString()]
      );
      if (inserted.rowCount) await run(client);
    });
  }

  private async transaction<T>(run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async writeOrder(client: pg.PoolClient, order: Order, isNew: boolean) {
    const uploadTokens = getUploadTokens(order);
    if (isNew) {
      await client.query(
        `INSERT INTO orders (id, tracking_token, upload_tokens, created_at, data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [order.id, order.trackingToken, uploadTokens, order.createdAt || new Date().toISOString(), JSON.stringify(order)]
      );
    } else {
      await client.query(
        "UPDATE orders SET tracking_token = $2, upload_tokens = $3, data = $4, updated_at = now() WHERE id = $1",
        [order.id, order.trackingToken, uploadTokens, JSON.stringify(order)]
      );
    }
  }

  private async writeFiles(client: pg.PoolClient, orderId: string, changes?: OrderChanges) {
    if (changes?.removeFileIds?.length) {
      await client.query("DELETE FROM order_files WHERE order_id = $1 AND id = ANY($2)", [orderId, changes.removeFileIds]);
    }
    for (const file of changes?.addFiles || []) {
      const decoded = decodeDataUrl(file.dataUrl);
      if (!decoded) throw new Error(`Ongeldige bestandsdata voor ${file.fileName}`);
      await client.query(
        `INSERT INTO order_files (id, order_id, file_name, file_type, data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [file.id, orderId, file.fileName, decoded.fileType, decoded.data]
      );
    }
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }

  async listOrders() {
    const result = await this.pool.query("SELECT data FROM orders ORDER BY created_at DESC");
    return result.rows.map((row) => row.data as Order);
  }

  async getOrder(id: string) {
    const result = await this.pool.query("SELECT data FROM orders WHERE id = $1", [id]);
    return (result.rows[0]?.data as Order) || null;
  }

  async findOrderByTrackingToken(token: string) {
    const result = await this.pool.query("SELECT data FROM orders WHERE tracking_token = $1", [token]);
    return (result.rows[0]?.data as Order) || null;
  }

  async findOrderByUploadToken(token: string) {
    const result = await this.pool.query("SELECT data FROM orders WHERE upload_tokens @> ARRAY[$1::text]", [token]);
    return (result.rows[0]?.data as Order) || null;
  }

  async insertOrder(order: Order, changes?: OrderChanges) {
    await this.transaction(async (client) => {
      await this.writeOrder(client, order, true);
      await this.writeFiles(client, order.id, changes);
    });
  }

  async updateOrder(id: string, mutate: (order: Order) => OrderChanges | void | false | Promise<OrderChanges | void | false>) {
    return this.transaction(async (client) => {
      const result = await client.query("SELECT data FROM orders WHERE id = $1 FOR UPDATE", [id]);
      const order = result.rows[0]?.data as Order | undefined;
      if (!order) return null;
      const changes = await mutate(order);
      if (changes === false) return null;
      await this.writeOrder(client, order, false);
      await this.writeFiles(client, id, changes || undefined);
      return order;
    });
  }

  async deleteOrder(id: string) {
    const result = await this.pool.query("DELETE FROM orders WHERE id = $1", [id]);
    return Boolean(result.rowCount);
  }

  async getFile(orderId: string, fileId: string) {
    const result = await this.pool.query(
      "SELECT file_name, file_type, data FROM order_files WHERE order_id = $1 AND id = $2",
      [orderId, fileId]
    );
    const row = result.rows[0];
    return row ? { fileName: row.file_name as string, fileType: row.file_type as string, data: row.data as Buffer } : null;
  }

  async listStaff() {
    const result = await this.pool.query("SELECT id, name, role FROM staff ORDER BY created_at, id");
    return result.rows as StaffMember[];
  }

  async addStaff(member: StaffMember) {
    await this.pool.query("INSERT INTO staff (id, name, role) VALUES ($1, $2, $3)", [member.id, member.name, member.role]);
  }

  async deleteStaff(id: string) {
    await this.pool.query("DELETE FROM staff WHERE id = $1", [id]);
  }

  async createSession(sessionId: string, expiresAt: number) {
    await this.pool.query("INSERT INTO admin_sessions (id_hash, expires_at) VALUES ($1, $2)", [
      hashSessionId(sessionId),
      new Date(expiresAt),
    ]);
  }

  async touchSession(sessionId: string, newExpiresAt: number) {
    const result = await this.pool.query(
      "UPDATE admin_sessions SET expires_at = $2 WHERE id_hash = $1 AND expires_at > now() RETURNING id_hash",
      [hashSessionId(sessionId), new Date(newExpiresAt)]
    );
    return Boolean(result.rowCount);
  }

  async deleteSession(sessionId: string) {
    await this.pool.query("DELETE FROM admin_sessions WHERE id_hash = $1", [hashSessionId(sessionId)]);
  }
}

/* ------------------------------------------------------------------ */
/* Lokaal bestand (alleen voor ontwikkelen zonder database)            */
/* ------------------------------------------------------------------ */

type LocalData = {
  orders: Order[];
  files: Record<string, { orderId: string; fileName: string; fileType: string; dataUrl: string }>;
  staff: StaffMember[];
  sessions: Record<string, number>;
};

class LocalFileStorage implements Storage {
  kind = "local-file" as const;
  private filePath = path.join(process.cwd(), "local-data.json");
  private data: LocalData = { orders: [], files: {}, staff: [], sessions: {} };
  private queue: Promise<unknown> = Promise.resolve();

  async init() {
    const existing = readLegacyJson("local-data.json");
    if (existing && Array.isArray(existing.orders)) {
      this.data = { orders: existing.orders, files: existing.files || {}, staff: existing.staff || [], sessions: existing.sessions || {} };
      return;
    }

    const legacyStaff = readLegacyJson("staff.json");
    this.data.staff = Array.isArray(legacyStaff) && legacyStaff.length ? legacyStaff : [...DEFAULT_STAFF];
    const legacyOrders = readLegacyJson("orders.json");
    if (Array.isArray(legacyOrders)) {
      for (const rawOrder of legacyOrders) {
        const { order, files } = splitLegacyFiles(rawOrder);
        this.data.orders.push(order);
        this.applyFiles(order.id, { addFiles: files });
      }
    }
    this.persist();
  }

  private persist() {
    const temporaryFile = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(this.data), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(temporaryFile, this.filePath);
  }

  private serial<T>(run: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private applyFiles(orderId: string, changes?: OrderChanges) {
    for (const fileId of changes?.removeFileIds || []) {
      if (this.data.files[fileId]?.orderId === orderId) delete this.data.files[fileId];
    }
    for (const file of changes?.addFiles || []) {
      this.data.files[file.id] = { orderId, fileName: file.fileName, fileType: file.fileType, dataUrl: file.dataUrl };
    }
  }

  private clone<T>(value: T): T {
    return value === undefined || value === null ? value : JSON.parse(JSON.stringify(value));
  }

  async ping() {}

  async listOrders() {
    return this.clone([...this.data.orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
  }

  async getOrder(id: string) {
    return this.clone(this.data.orders.find((order) => order.id === id) || null);
  }

  async findOrderByTrackingToken(token: string) {
    return this.clone(this.data.orders.find((order) => order.trackingToken === token) || null);
  }

  async findOrderByUploadToken(token: string) {
    return this.clone(this.data.orders.find((order) => getUploadTokens(order).includes(token)) || null);
  }

  insertOrder(order: Order, changes?: OrderChanges) {
    return this.serial(() => {
      this.data.orders.unshift(this.clone(order));
      this.applyFiles(order.id, changes);
      this.persist();
    });
  }

  updateOrder(id: string, mutate: (order: Order) => OrderChanges | void | false | Promise<OrderChanges | void | false>) {
    return this.serial(async () => {
      const index = this.data.orders.findIndex((order) => order.id === id);
      if (index === -1) return null;
      const order = this.clone(this.data.orders[index]);
      const changes = await mutate(order);
      if (changes === false) return null;
      this.data.orders[index] = order;
      this.applyFiles(id, changes || undefined);
      this.persist();
      return this.clone(order);
    });
  }

  deleteOrder(id: string) {
    return this.serial(() => {
      const before = this.data.orders.length;
      this.data.orders = this.data.orders.filter((order) => order.id !== id);
      for (const [fileId, file] of Object.entries(this.data.files)) {
        if (file.orderId === id) delete this.data.files[fileId];
      }
      this.persist();
      return this.data.orders.length !== before;
    });
  }

  async getFile(orderId: string, fileId: string) {
    const file = this.data.files[fileId];
    if (!file || file.orderId !== orderId) return null;
    const decoded = decodeDataUrl(file.dataUrl);
    return decoded ? { fileName: file.fileName, fileType: decoded.fileType, data: decoded.data } : null;
  }

  async listStaff() {
    return this.clone(this.data.staff);
  }

  addStaff(member: StaffMember) {
    return this.serial(() => {
      this.data.staff.push(member);
      this.persist();
    });
  }

  deleteStaff(id: string) {
    return this.serial(() => {
      this.data.staff = this.data.staff.filter((member) => member.id !== id);
      this.persist();
    });
  }

  createSession(sessionId: string, expiresAt: number) {
    return this.serial(() => {
      const now = Date.now();
      for (const [key, expiry] of Object.entries(this.data.sessions)) {
        if (expiry <= now) delete this.data.sessions[key];
      }
      this.data.sessions[hashSessionId(sessionId)] = expiresAt;
      this.persist();
    });
  }

  async touchSession(sessionId: string, newExpiresAt: number) {
    const key = hashSessionId(sessionId);
    const expiry = this.data.sessions[key];
    if (!expiry || expiry <= Date.now()) return false;
    this.data.sessions[key] = newExpiresAt;
    return true;
  }

  deleteSession(sessionId: string) {
    return this.serial(() => {
      delete this.data.sessions[hashSessionId(sessionId)];
      this.persist();
    });
  }
}

export function createStorage(): Storage {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) return new PostgresStorage(databaseUrl);

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[storage] LET OP: DATABASE_URL ontbreekt. Orders worden in een lokaal bestand opgeslagen en gaan verloren bij een redeploy."
    );
  }
  return new LocalFileStorage();
}
