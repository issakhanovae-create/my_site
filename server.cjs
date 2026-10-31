const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

// Последний рубеж: без этого необработанный throw/reject в хендлере запроса
// (например, сбой SQLite в GET-роуте) по умолчанию в Node валит весь процесс.
// После uncaughtException состояние процесса (SQLite handle, память) не гарантировано
// целым — Node сам рекомендует не "жить дальше", а падать контролируемо.
// start.bat перезапускает процесс при ненулевом коде выхода.
process.on("uncaughtException", (error) => {
  console.error("uncaughtException:", error && error.stack ? error.stack : error);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason && reason.stack ? reason.stack : reason);
  process.exit(1);
});

const root = __dirname;

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(path.join(root, ".env"));

const productsSeedFile = path.join(root, "data", "products.json");
const shopDir = path.join(root, "img", "shop");
const port = Number(process.env.PORT) || 8765;
const bindHost = String(process.env.BIND_HOST || "127.0.0.1").trim() || "127.0.0.1";
const password = String(process.env.ADMIN_PASSWORD || "");
if (password.length < 12) {
  console.error("Задайте ADMIN_PASSWORD в .env (минимум 12 символов)");
  process.exit(1);
}
function cleanSellerPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return /^7\d{10}$/.test(digits) ? digits : "";
}
const envSellerPhone =
  cleanSellerPhone(process.env.WHATSAPP_PHONE) || cleanSellerPhone(process.env.AI_WHATSAPP_PHONE);
if ((process.env.WHATSAPP_PHONE || process.env.AI_WHATSAPP_PHONE) && !envSellerPhone) {
  console.warn(
    "WHATSAPP_PHONE в .env невалиден (нужен формат 7XXXXXXXXXX). Использую запасной номер."
  );
}
const elmiraPhone = envSellerPhone || "77028711150";
const orderRateMax = Math.max(5, Math.min(200, Number(process.env.ORDER_RATE_MAX) || 20));
const orderRateWindowMs = Math.max(
  60_000,
  Math.min(3_600_000, Number(process.env.ORDER_RATE_WINDOW_MS) || 600_000)
);
// Только за своим reverse proxy: иначе клиент подделает X-Forwarded-For и обойдёт лимиты.
const trustProxy = /^(1|true|yes)$/i.test(String(process.env.TRUST_PROXY || "").trim());

function isIpLiteral(value) {
  const s = String(value || "").trim();
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return true;
  if (s.includes(":") && /^[0-9a-fA-F:.%]+$/.test(s)) return true;
  return false;
}

/** Client IP for rate limits. With TRUST_PROXY=1 uses rightmost X-Forwarded-For / X-Real-IP. */
function clientIp(req) {
  if (trustProxy && req && req.headers) {
    const xff = req.headers["x-forwarded-for"];
    if (xff) {
      const parts = String(xff)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        if (isIpLiteral(parts[i])) return parts[i];
      }
    }
    const realIp = String(req.headers["x-real-ip"] || "").trim();
    if (isIpLiteral(realIp)) return realIp;
  }
  return (req && req.socket && req.socket.remoteAddress) || "local";
}
// Вложение до 4 МБ уходит как base64 (~×4/3) внутри JSON — запас нужен ≥ ~5.5 МБ.
const chatBodyMax = Math.max(
  100_000,
  Math.min(8_000_000, Number(process.env.CHAT_BODY_MAX) || 6_000_000)
);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_DEFAULT = 40;
const PAGE_MAX = 100;
const BACKUP_EVERY_ORDERS = 25;
const BACKUP_EVERY_MS = 6 * 60 * 60 * 1000;
const loginHits = new Map();

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};

const distDir = path.join(root, "dist");
const spaShell = path.join(distDir, "index.html");

fs.mkdirSync(path.join(root, "data"), { recursive: true });
const crmPath = path.join(root, "data", "crm.db");
const backupDir = path.join(root, "data", "backups");
let crm = null;

function backupCrm() {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = path.join(backupDir, "crm-" + stamp + ".db");
  if (crm) {
    // Consistent snapshot while WAL is open (plain copyFile can miss wal pages).
    const safe = dest.replace(/'/g, "''");
    crm.exec("VACUUM INTO '" + safe + "'");
  } else if (fs.existsSync(crmPath)) {
    fs.copyFileSync(crmPath, dest);
  } else {
    return;
  }
  const keep = 10;
  const files = fs.readdirSync(backupDir)
    .filter((name) => /^crm-.*\.db$/i.test(name))
    .map((name) => ({ name, time: fs.statSync(path.join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const file of files.slice(keep)) {
    fs.rmSync(path.join(backupDir, file.name), { force: true });
  }
}

crm = new DatabaseSync(crmPath);
crm.exec("PRAGMA journal_mode = WAL;");
crm.exec("PRAGMA synchronous = NORMAL;");
crm.exec("PRAGMA busy_timeout = 5000;");
crm.exec("PRAGMA foreign_keys = ON;");
crm.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    comment TEXT NOT NULL,
    items TEXT NOT NULL,
    totals TEXT NOT NULL
  )
`);
crm.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    hidden INTEGER NOT NULL DEFAULT 0,
    seen_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new'
  )
`);
crm.exec(`
  CREATE TABLE IF NOT EXISTS order_keys (
    key TEXT PRIMARY KEY,
    order_id INTEGER NOT NULL,
    whatsapp TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);
crm.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL,
    kind TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    pos INTEGER NOT NULL,
    stock INTEGER NOT NULL DEFAULT -1
  )
`);
crm.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);
crm.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    expires INTEGER NOT NULL
  )
`);
crm.exec("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires)");
crm.exec("CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone)");
crm.exec("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)");
crm.exec("CREATE INDEX IF NOT EXISTS idx_clients_hidden_seen ON clients(hidden, seen_at DESC)");
crm.exec("CREATE INDEX IF NOT EXISTS idx_order_keys_created ON order_keys(created_at)");
crm.exec("CREATE INDEX IF NOT EXISTS idx_products_pos ON products(pos, id)");
try { backupCrm(); } catch (error) {
  console.error("стартовый бэкап CRM не удался:", error && error.message ? error.message : error);
}
const getMeta = crm.prepare("SELECT value FROM meta WHERE key = ?");
const setMeta = crm.prepare(`
  INSERT INTO meta (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
{
  // Смена ADMIN_PASSWORD в .env сама по себе не делает старые Bearer-токены
  // недействительными — без этого украденная/оставленная сессия продолжает
  // работать до истечения TTL даже после смены пароля. Храним не сам пароль,
  // а его хеш, и при расхождении с прошлым запуском чистим все сессии.
  const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
  const stored = getMeta.get("admin_password_hash");
  if (!stored) {
    setMeta.run("admin_password_hash", passwordHash);
  } else if (stored.value !== passwordHash) {
    crm.exec("DELETE FROM sessions");
    setMeta.run("admin_password_hash", passwordHash);
    console.log("ADMIN_PASSWORD изменился — все активные сессии админки сброшены");
  }
}
const clientStatusAdded = !crm.prepare("PRAGMA table_info(clients)").all().some((column) => column.name === "status");
if (clientStatusAdded) crm.exec("ALTER TABLE clients ADD COLUMN status TEXT NOT NULL DEFAULT 'new'");
const productColumns = crm.prepare("PRAGMA table_info(products)").all().map((column) => column.name);
if (!productColumns.includes("stock")) {
  crm.exec("ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT -1");
  // Goods inherit former quantity as warehouse stock; services stay unlimited (-1).
  crm.prepare("UPDATE products SET stock = quantity WHERE kind != 'услуга'").run();
}
const insertOrder = crm.prepare(`
  INSERT INTO orders (created_at, status, name, phone, comment, items, totals)
  VALUES (?, 'new', ?, ?, ?, ?, ?)
`);
const listOrdersPage = crm.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT ? OFFSET ?");
const listOrdersByStatusPage = crm.prepare(
  "SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT ? OFFSET ?"
);
const listOrdersBefore = crm.prepare("SELECT * FROM orders WHERE id < ? ORDER BY id DESC LIMIT ?");
const listOrdersByStatusBefore = crm.prepare(
  "SELECT * FROM orders WHERE status = ? AND id < ? ORDER BY id DESC LIMIT ?"
);
const countOrdersAll = crm.prepare("SELECT COUNT(*) AS n FROM orders");
const countOrdersByStatus = crm.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = ?");
const getOrder = crm.prepare("SELECT * FROM orders WHERE id = ?");
const setOrderStatus = crm.prepare("UPDATE orders SET status = ? WHERE id = ?");
const setClientStatus = crm.prepare("UPDATE clients SET status = ? WHERE phone = ?");
const saveClient = crm.prepare(`
  INSERT INTO clients (phone, name, note, hidden, seen_at)
  VALUES (?, ?, '', 0, ?)
  ON CONFLICT(phone) DO UPDATE SET
    name = excluded.name,
    seen_at = excluded.seen_at
`);
const saveClientOpen = crm.prepare(`
  INSERT INTO clients (phone, name, note, hidden, seen_at, status)
  VALUES (?, ?, '', 0, ?, 'new')
  ON CONFLICT(phone) DO UPDATE SET
    name = excluded.name,
    seen_at = excluded.seen_at,
    hidden = 0
`);
// status на повторном заказе не трогаем: админский статус (done/work) липкий,
// пока не изменят последний заказ. unhide — да (клиент снова активен).
const listClientsPage = crm.prepare(
  "SELECT * FROM clients ORDER BY hidden ASC, seen_at DESC LIMIT ? OFFSET ?"
);
const countClientsAll = crm.prepare("SELECT COUNT(*) AS n FROM clients");
const countClientsVisible = crm.prepare("SELECT COUNT(*) AS n FROM clients WHERE hidden = 0");
const getClient = crm.prepare("SELECT * FROM clients WHERE phone = ?");
const setClient = crm.prepare("UPDATE clients SET note = ?, hidden = ?, status = ? WHERE phone = ?");
const latestOrderItems = crm.prepare("SELECT items FROM orders WHERE phone = ? ORDER BY id DESC LIMIT 1");
const clientOrderStats = crm.prepare("SELECT COUNT(*) AS count, MAX(created_at) AS last FROM orders WHERE phone = ?");
const deleteOrder = crm.prepare("DELETE FROM orders WHERE id = ?");
const latestOrder = crm.prepare("SELECT id, status FROM orders WHERE phone = ? ORDER BY id DESC LIMIT 1");
const latestOrderStatus = crm.prepare("SELECT status FROM orders WHERE phone = ? ORDER BY id DESC LIMIT 1");
const getOrderKey = crm.prepare("SELECT order_id AS id, whatsapp FROM order_keys WHERE key = ?");
const putOrderKey = crm.prepare("INSERT INTO order_keys (key, order_id, whatsapp, created_at) VALUES (?, ?, ?, ?)");
const deleteOrderKey = crm.prepare("DELETE FROM order_keys WHERE key = ?");
const deleteOrderKeysByOrder = crm.prepare("DELETE FROM order_keys WHERE order_id = ?");
const pruneOrderKeysDb = crm.prepare("DELETE FROM order_keys WHERE created_at < ?");
const putSession = crm.prepare("INSERT INTO sessions (token, expires) VALUES (?, ?)");
const getSession = crm.prepare("SELECT expires FROM sessions WHERE token = ?");
const touchSession = crm.prepare("UPDATE sessions SET expires = ? WHERE token = ?");
const delSession = crm.prepare("DELETE FROM sessions WHERE token = ?");
const pruneSessionsDb = crm.prepare("DELETE FROM sessions WHERE expires < ?");
const listProductRows = crm.prepare("SELECT * FROM products ORDER BY pos ASC, id ASC");
const getProductRow = crm.prepare("SELECT * FROM products WHERE id = ?");
const countProducts = crm.prepare("SELECT COUNT(*) AS n FROM products");
const insertProductRow = crm.prepare(`
  INSERT INTO products (id, name, price, currency, kind, quantity, description, image, pos, stock)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateProductRow = crm.prepare(`
  UPDATE products
  SET name = ?, price = ?, currency = ?, kind = ?, quantity = ?, description = ?, image = ?, stock = ?
  WHERE id = ?
`);
const deleteProductRow = crm.prepare("DELETE FROM products WHERE id = ?");
const bumpProductPositions = crm.prepare("UPDATE products SET pos = pos + 1");
const consumeProductStock = crm.prepare(`
  UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?
`);
const restoreProductStock = crm.prepare(`
  UPDATE products SET stock = stock + ? WHERE id = ? AND stock >= 0
`);
function withTransaction(fn) {
  crm.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    crm.exec("COMMIT");
    return result;
  } catch (error) {
    try { crm.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function publicProduct(row) {
  if (!row) return null;
  const stock = Number(row.stock);
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    currency: row.currency,
    kind: row.kind,
    quantity: Number(row.quantity),
    stock: Number.isFinite(stock) ? stock : -1,
    description: row.description || "",
    image: row.image || ""
  };
}

let productsCache = null;

function invalidateProductsCache() {
  productsCache = null;
}

function readProducts() {
  if (!productsCache) productsCache = listProductRows.all().map(publicProduct);
  // Copy so callers cannot mutate the shared cache array.
  return productsCache.slice();
}

function getProduct(id) {
  return publicProduct(getProductRow.get(id));
}

function createProduct(product) {
  withTransaction(() => {
    bumpProductPositions.run();
    insertProductRow.run(
      product.id,
      product.name,
      product.price,
      product.currency,
      product.kind,
      product.quantity,
      product.description || "",
      product.image || "",
      0,
      product.stock
    );
  });
  invalidateProductsCache();
  return getProduct(product.id);
}

function saveProduct(product) {
  const result = updateProductRow.run(
    product.name,
    product.price,
    product.currency,
    product.kind,
    product.quantity,
    product.description || "",
    product.image || "",
    product.stock,
    product.id
  );
  if (result.changes !== 1) return null;
  invalidateProductsCache();
  return getProduct(product.id);
}

function removeProduct(id) {
  const current = getProduct(id);
  if (!current) return null;
  if (deleteProductRow.run(id).changes !== 1) return null;
  invalidateProductsCache();
  return current;
}

function pageParams(url) {
  const limit = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || PAGE_DEFAULT)));
  const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset")) || 0));
  return { limit, offset };
}

function metaNumber(key) {
  const row = getMeta.get(key);
  const n = Number(row && row.value);
  return Number.isFinite(n) ? n : 0;
}

function maybeBackupAfterOrder() {
  const n = metaNumber("orders_since_backup") + 1;
  if (n < BACKUP_EVERY_ORDERS) {
    setMeta.run("orders_since_backup", String(n));
    return;
  }
  try {
    backupCrm();
    setMeta.run("orders_since_backup", "0");
  } catch {
    // Keep the counter so the next order retries the backup.
    setMeta.run("orders_since_backup", String(n));
  }
}

function migrateProductsFromJson() {
  // One-shot bootstrap: import seed JSON only when the catalog was never bootstrapped.
  // After that, an empty products table (admin deleted everything) stays empty.
  if (getMeta.get("catalog_bootstrapped")) return;
  if (Number(countProducts.get().n) > 0) {
    setMeta.run("catalog_bootstrapped", "1");
    return;
  }
  const seedCandidates = [productsSeedFile, productsSeedFile + ".migrated"];
  let list = null;
  let source = "";
  for (const file of seedCandidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(data) && data.length) {
        list = data;
        source = file;
        break;
      }
    } catch {}
  }
  let imported = 0;
  if (list) {
    withTransaction(() => {
      list.forEach((item, index) => {
        const id = String(item && item.id || "").trim();
        const name = String(item && item.name || "").trim();
        const price = Number(item && item.price);
        if (!id || !name || !Number.isFinite(price) || price < 0) return;
        if (getProductRow.get(id)) return;
        const currency = ["KZT", "RUB", "USD"].includes(item.currency) ? item.currency : "KZT";
        const kind = item.kind === "услуга" ? "услуга" : "товар";
        const quantity = Math.min(99, Math.max(1, Math.floor(Number(item.quantity)) || 1));
        const description = String(item.description || "").trim().slice(0, 400);
        const image = String(item.image || "").trim();
        let stock = -1;
        if (kind !== "услуга") {
          const rawStock = item.stock === undefined ? quantity : Number(item.stock);
          stock = Number.isFinite(rawStock) ? Math.max(0, Math.min(100000, Math.floor(rawStock))) : quantity;
        }
        insertProductRow.run(id, name, price, currency, kind, quantity, description, image, index, stock);
        imported += 1;
      });
    });
  }
  setMeta.run("catalog_bootstrapped", "1");
  invalidateProductsCache();
  if (imported > 0) {
    console.log("каталог перенесён в SQLite из " + path.basename(source) + " (" + imported + " шт.)");
  }
}

migrateProductsFromJson();

const { createAi } = require("./ai");
const ai = createAi({ getProducts: readProducts, phone: elmiraPhone, clientIp });

function resolveOrderKey(key) {
  // Keep keys long enough for retries / multi-tab (client stores key in localStorage).
  pruneOrderKeysDb.run(Date.now() - 86_400_000);
  const row = getOrderKey.get(key);
  if (!row) return null;
  const id = Number(row.id);
  // Drop stale keys after admin deleted the order — otherwise retries return a ghost id.
  if (!getOrder.get(id)) {
    deleteOrderKey.run(key);
    return null;
  }
  return { id, whatsapp: row.whatsapp };
}

function failOrder(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function adjustStock(items, direction) {
  let touched = false;
  for (const line of items) {
    const qty = Math.floor(Number(line.qty));
    if (!line.id || !Number.isFinite(qty) || qty < 1) continue;
    const row = getProductRow.get(line.id);
    if (!row) {
      // Consuming (place / uncancel) must fail if the SKU is gone; restore may skip.
      if (direction < 0) failOrder("stock");
      continue;
    }
    const stock = Number(row.stock);
    if (!Number.isFinite(stock) || stock < 0) continue;
    if (direction < 0) {
      if (consumeProductStock.run(qty, line.id, qty).changes !== 1) failOrder("stock");
    } else {
      restoreProductStock.run(qty, line.id);
    }
    touched = true;
  }
  if (touched) invalidateProductsCache();
}

function placeOrder(createdAt, name, phone, comment, rawItems, key) {
  const saved = withTransaction(() => {
    if (key) {
      const cached = getOrderKey.get(key);
      if (cached) {
        const id = Number(cached.id);
        if (getOrder.get(id)) return { id, whatsapp: cached.whatsapp, cached: true };
        deleteOrderKey.run(key);
      }
    }
    const items = orderLines(rawItems);
    if (!items) failOrder("bad_items");
    adjustStock(items, -1);
    const totals = totalsOf(items);
    const inserted = insertOrder.run(createdAt, name, phone, comment, JSON.stringify(items), JSON.stringify(totals));
    const id = Number(inserted.lastInsertRowid);
    saveClientOpen.run(phone, name, createdAt);
    const order = { id, name, phone, comment, items, totals };
    const whatsapp = "https://wa.me/" + elmiraPhone + "?text=" + encodeURIComponent(orderMessage(order));
    if (key) putOrderKey.run(key, id, whatsapp, Date.now());
    return { id, whatsapp, cached: false };
  });
  if (!saved.cached) maybeBackupAfterOrder();
  return saved;
}

for (const row of crm.prepare("SELECT name, phone, created_at FROM orders ORDER BY id ASC").all()) {
  saveClient.run(canonPhone(row.phone), row.name, row.created_at);
}
mergeClients();

const orderStatuses = ["new", "work", "done", "cancel"];

if (clientStatusAdded) {
  for (const client of crm.prepare("SELECT phone FROM clients").all()) {
    const order = latestOrderStatus.get(client.phone);
    if (order && orderStatuses.includes(order.status)) setClientStatus.run(order.status, client.phone);
  }
}

function cleanName(value) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) return "";
  return name;
}

function canonPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length === 10) digits = "7" + digits;
  return digits;
}

function cleanPhone(value) {
  const digits = canonPhone(value);
  // KZ/RU мобильный: 11 цифр, начинается с 7 (после нормализации 8… → 7…)
  if (!/^7\d{10}$/.test(digits)) return "";
  if (/^7(\d)\1{9}$/.test(digits)) return "";
  return digits;
}

function mergeClients() {
  const people = crm.prepare("SELECT * FROM clients").all();
  const orderPhones = crm.prepare("SELECT DISTINCT phone FROM orders").all();
  const canonSet = new Set();
  let dirty = people.some((row) => {
    const phone = canonPhone(row.phone);
    if (!phone || phone !== row.phone || canonSet.has(phone)) return true;
    canonSet.add(phone);
    return false;
  });
  dirty = dirty || orderPhones.some((row) => canonPhone(row.phone) !== row.phone);
  if (!dirty) return;

  const byPhone = new Map();
  for (const row of people) {
    const phone = canonPhone(row.phone);
    if (!/^7\d{10}$/.test(phone)) continue;
    const prev = byPhone.get(phone);
    if (!prev) {
      byPhone.set(phone, { ...row, phone });
      continue;
    }
    const newer = String(row.seen_at) > String(prev.seen_at) ? row : prev;
    const older = newer === row ? prev : row;
    byPhone.set(phone, {
      phone,
      name: newer.name || older.name,
      note: newer.note || older.note || "",
      hidden: newer.hidden && older.hidden ? 1 : 0,
      seen_at: newer.seen_at || older.seen_at,
      status: newer.status || older.status || "new"
    });
  }
  const retarget = crm.prepare("UPDATE orders SET phone = ? WHERE phone = ?");
  const insert = crm.prepare("INSERT INTO clients (phone, name, note, hidden, seen_at, status) VALUES (?, ?, ?, ?, ?, ?)");
  withTransaction(() => {
    for (const row of orderPhones) {
      const phone = canonPhone(row.phone);
      if (phone && phone !== row.phone) retarget.run(phone, row.phone);
    }
    crm.exec("DELETE FROM clients");
    for (const client of byPhone.values()) {
      insert.run(client.phone, client.name, client.note || "", client.hidden ? 1 : 0, client.seen_at, client.status || "new");
    }
  });
}

function cleanComment(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function maxPerOrder(product) {
  const qty = Math.floor(Number(product && product.quantity));
  if (!Number.isFinite(qty) || qty < 1) return 1;
  return Math.min(99, qty);
}

/** Max units a client may take now: min(max-per-order, stock). stock < 0 = unlimited. */
function stockOf(product) {
  const cap = maxPerOrder(product);
  const stock = Number(product && product.stock);
  if (Number.isFinite(stock) && stock >= 0) return Math.min(cap, Math.max(0, Math.floor(stock)));
  return cap;
}

function orderLines(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 30) return null;
  const qtyById = new Map();
  for (const row of raw) {
    const id = String(row && row.id || "");
    const qty = Math.floor(Number(row && row.qty));
    if (!id || !Number.isFinite(qty) || qty < 1) return null;
    qtyById.set(id, (qtyById.get(id) || 0) + qty);
  }
  if (qtyById.size > 30) return null;
  const lines = [];
  for (const [id, qty] of qtyById) {
    const product = getProduct(id);
    if (!product) return null;
    const cap = maxPerOrder(product);
    const available = stockOf(product);
    if (qty > cap) return null;
    if (qty > available) failOrder("stock");
    lines.push({
      id: product.id,
      name: product.name,
      kind: product.kind === "услуга" ? "услуга" : "товар",
      price: product.price,
      currency: marks[product.currency] ? product.currency : "KZT",
      qty
    });
  }
  return lines;
}

function cleanIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) return "";
  return key;
}


function totalsOf(items) {
  const sums = {};
  items.forEach((item) => {
    sums[item.currency] = (sums[item.currency] || 0) + item.price * item.qty;
  });
  return Object.entries(sums).map(([currency, sum]) => ({ currency, sum }));
}

function orderMessage(order) {
  const lines = order.items.map((item, index) => {
    return (index + 1) + ". " + item.name + " (" + item.kind + ") — " + item.qty + " × " + money(item.price, item.currency);
  });
  const totals = order.totals.map((item) => money(item.sum, item.currency)).join(", ");
  let text = "Здравствуйте, Эльмира. Заказ №" + order.id + "\n" + order.name + ", +" + order.phone + "\n\n" + lines.join("\n") + "\n\nИтого: " + totals;
  if (order.comment) text += "\n\n" + order.comment;
  return text;
}

function parseJsonList(value) {
  try {
    const data = JSON.parse(value);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Как parseJsonList, но для операций, которые по items двигают склад (delete/cancel заказа):
 * битый JSON не должен молча превращаться в [] и давать adjustStock() ничего не сделать —
 * операция должна упасть явной 409, а не тихо рассинхронить остатки.
 */
function parseOrderItemsOrFail(value) {
  try {
    const data = JSON.parse(value);
    // orderLines() никогда не создаёт заказ с пустыми items — пустой массив здесь
    // означает битые/обнулённые данные, а не легитимный заказ без позиций.
    if (Array.isArray(data) && data.length) return data;
  } catch {}
  failOrder("corrupt_items");
}

function publicOrder(row) {
  const order = {
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    name: row.name,
    phone: row.phone,
    comment: row.comment,
    items: parseJsonList(row.items),
    totals: parseJsonList(row.totals)
  };
  order.clientWhatsapp = "https://wa.me/" + order.phone + "?text=" + encodeURIComponent(clientHello(order.name, order.items));
  return order;
}

function clientItems(phone) {
  const row = latestOrderItems.get(phone);
  return row ? parseJsonList(row.items) : [];
}

function clientHello(name, items) {
  const goods = items.length
    ? items.map((line) => line.qty + " × " + line.name).join(", ")
    : "что-то";
  return "Здравствуйте, " + name + ". Вы хотели заказать у нас " + goods + ".";
}

function syncClientFromLatest(phone) {
  const client = getClient.get(phone);
  if (!client) return;
  const order = latestOrderStatus.get(phone);
  // Без заказов оставляем ручной статус клиента (не сбрасываем в new)
  if (order && orderStatuses.includes(order.status)) {
    setClientStatus.run(order.status, phone);
  }
}

function publicClient(row) {
  const items = clientItems(row.phone);
  const stats = clientOrderStats.get(row.phone) || { count: 0, last: "" };
  return {
    phone: row.phone,
    name: row.name,
    note: row.note,
    hidden: !!row.hidden,
    status: orderStatuses.includes(row.status) ? row.status : "new",
    seenAt: row.seen_at,
    orders: Number(stats.count) || 0,
    lastOrderAt: stats.last || "",
    whatsapp: "https://wa.me/" + row.phone + "?text=" + encodeURIComponent(clientHello(row.name, items))
  };
}

const orderHits = new Map();

function pruneHitMap(map, windowMs) {
  const now = Date.now();
  for (const [ip, times] of map) {
    const recent = (times || []).filter((time) => now - time < windowMs);
    if (recent.length) map.set(ip, recent);
    else map.delete(ip);
  }
}

function recentOrders(ip) {
  pruneHitMap(orderHits, orderRateWindowMs);
  const recent = orderHits.get(ip) || [];
  orderHits.set(ip, recent);
  return recent;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("too big"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res, code, body, type) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const contentType = type || "application/json; charset=utf-8";
  const headers = {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "SAMEORIGIN",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    // JSON API must not be browser-cached (stale catalog/prices); static assets OK.
    "Cache-Control": contentType.startsWith("application/json")
      || contentType.startsWith("text/html")
      || contentType.includes("javascript")
      ? "no-store"
      : "public, max-age=3600"
  };
  if (contentType.startsWith("text/html")) {
    // Google Fonts используются в index.html (Commissioner / Sofia Sans).
    headers["Content-Security-Policy"] =
      "default-src 'self'; " +
      "img-src 'self' data: blob:; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "script-src 'self'; " +
      "connect-src 'self'; " +
      "font-src 'self' data: https://fonts.gstatic.com; " +
      "frame-ancestors 'self'; base-uri 'self'";
  }
  res.writeHead(code, headers);
  res.end(payload);
}

function sameSecret(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  const len = Math.max(a.length, b.length, 1);
  const aa = Buffer.alloc(len);
  const bb = Buffer.alloc(len);
  a.copy(aa);
  b.copy(bb);
  // Сравниваем буферы фиксированной длины, затем длины — без раннего return по длине.
  return crypto.timingSafeEqual(aa, bb) && a.length === b.length;
}

function createSession() {
  pruneSessionsDb.run(Date.now());
  const token = crypto.randomBytes(32).toString("base64url");
  putSession.run(token, Date.now() + SESSION_MS);
  return token;
}

function dropSession(token) {
  if (token) delSession.run(token);
}

function readToken(req) {
  const header = String(req.headers.authorization || "");
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return "";
  return header.slice(prefix.length);
}

function allowed(req) {
  const token = readToken(req);
  if (!token) return false;
  const row = getSession.get(token);
  if (!row || Number(row.expires) < Date.now()) {
    if (token) delSession.run(token);
    return false;
  }
  touchSession.run(Date.now() + SESSION_MS, token);
  return true;
}

function loginLimited(ip) {
  const now = Date.now();
  const recent = (loginHits.get(ip) || []).filter((time) => now - time < 900_000);
  loginHits.set(ip, recent);
  return recent.length >= 15;
}

function markLoginFail(ip) {
  const recent = loginHits.get(ip) || [];
  recent.push(Date.now());
  loginHits.set(ip, recent);
}

function productFrom(body, previous) {
  const name = String(body.name || "").trim();
  const price = Number(body.price);
  const currency = ["KZT", "RUB", "USD"].includes(body.currency) ? body.currency : "KZT";
  const kind = body.kind === "услуга" ? "услуга" : "товар";
  const quantity = Math.min(99, Math.max(1, Math.floor(Number(body.quantity)) || 1));
  const description = String(body.description || "").trim().slice(0, 400);
  if (!name || name.length > 80 || !Number.isFinite(price) || price < 0) return null;
  let stock = -1;
  if (kind === "услуга") {
    stock = -1;
  } else if (body.stock === undefined || body.stock === null || body.stock === "") {
    stock = previous && Number.isFinite(Number(previous.stock)) && Number(previous.stock) >= 0
      ? Math.floor(Number(previous.stock))
      : quantity;
  } else {
    const raw = Math.floor(Number(body.stock));
    if (!Number.isFinite(raw) || raw < -1 || raw > 100000) return null;
    stock = raw < 0 ? -1 : raw;
  }
  let image = previous ? previous.image || "" : "";
  if (body.image) {
    const saved = saveImage(body.image);
    if (saved) {
      if (previous) removeImage(previous.image);
      image = saved;
    }
  }
  return {
    id: previous ? previous.id : crypto.randomBytes(6).toString("hex"),
    name,
    price,
    currency,
    kind,
    quantity,
    stock,
    description,
    image
  };
}

function saveImage(dataUrl) {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(dataUrl || "");
  if (!match) return "";
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 3_000_000) return "";
  const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const id = crypto.randomBytes(8).toString("hex");
  const filename = id + "." + ext;
  fs.mkdirSync(shopDir, { recursive: true });
  fs.writeFileSync(path.join(shopDir, filename), buffer);
  return "img/shop/" + filename;
}

function removeImage(image) {
  if (!image || !image.startsWith("img/shop/")) return;
  const file = path.normalize(path.join(root, image));
  if (file.toLowerCase().startsWith(shopDir.toLowerCase())) {
    fs.rmSync(file, { force: true });
  }
}

const marks = { KZT: "₸", RUB: "₽", USD: "$" };

function money(value, currency) {
  const code = marks[currency] ? currency : "KZT";
  const amount = new Intl.NumberFormat("ru-RU").format(value);
  return code === "USD" ? "$" + amount : amount + " " + marks[code];
}

const server = http.createServer(async (req, res) => {
  // Общая сеть безопасности: любой непойманный throw в конкретном роуте (GET без
  // своего try/catch, сбой БД/ФС) превращается в 500, а не в висящий запрос
  // или unhandledRejection на весь процесс.
  let pathname = req.url;
  try {
  const url = new URL(req.url, "http://127.0.0.1");
  pathname = decodeURIComponent(url.pathname);

  if (pathname === "/api/login" && req.method === "POST") {
    const ip = clientIp(req);
    if (loginLimited(ip)) {
      send(res, 429, { error: "Слишком много попыток. Подождите немного." });
      return;
    }
    try {
      const body = JSON.parse((await readBody(req, 20_000)).toString("utf8"));
      if (!sameSecret(body.password, password)) {
        markLoginFail(ip);
        send(res, 401, { error: "Неверный пароль" });
        return;
      }
      send(res, 200, { ok: true, token: createSession() });
    } catch {
      send(res, 400, { error: "Не получилось проверить пароль" });
    }
    return;
  }

  if (pathname === "/api/session" && req.method === "GET") {
    if (!allowed(req)) {
      send(res, 401, { error: "Нужен пароль" });
      return;
    }
    send(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    dropSession(readToken(req));
    send(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/site" && req.method === "GET") {
    send(res, 200, {
      whatsappPhone: elmiraPhone,
      whatsapp: "https://wa.me/" + elmiraPhone
    });
    return;
  }

  if (pathname === "/api/chat" && req.method === "POST") {
    try {
      const raw = await readBody(req, chatBodyMax);
      const ac = new AbortController();
      const onClose = () => {
        if (!res.writableEnded) ac.abort();
      };
      res.on("close", onClose);
      let result;
      try {
        result = await ai.handleChat(req, raw, { ip: clientIp(req), signal: ac.signal });
      } finally {
        res.off("close", onClose);
      }
      if (ac.signal.aborted || res.writableEnded) return;
      // 499 = клиент оборвал соединение; снаружи отдаём обычный 400.
      const status = result.status === 499 ? 400 : result.status;
      send(res, status, result.body);
    } catch (error) {
      if (res.writableEnded) return;
      // readBody шлёт именно это сообщение при превышении chatBodyMax — это 413,
      // не "не получилось прочитать вопрос" (parse внутри ai.handleChat уже сам
      // возвращает свой 400 и сюда не долетает).
      if (error && error.message === "too big") {
        send(res, 413, { error: "Слишком большой запрос" });
        return;
      }
      console.error("POST /api/chat:", error && error.stack ? error.stack : error);
      send(res, 500, { error: "Не получилось ответить. Попробуйте ещё раз." });
    }
    return;
  }

  if (pathname === "/api/orders" && req.method === "POST") {
    const ip = clientIp(req);
    try {
      const body = JSON.parse((await readBody(req, 40_000)).toString("utf8"));
      const key = cleanIdempotencyKey(body.idempotencyKey);
      if (key) {
        const cached = resolveOrderKey(key);
        if (cached) {
          send(res, 201, { id: cached.id, whatsapp: cached.whatsapp });
          return;
        }
      }
      const name = cleanName(body.name);
      const phone = cleanPhone(body.phone);
      const comment = cleanComment(body.comment);
      if (!name || !phone || !Array.isArray(body.items)) {
        send(res, 400, { error: "Укажите имя, телефон (+7…) и хотя бы одну позицию из витрины" });
        return;
      }
      const recent = recentOrders(ip);
      if (recent.length >= orderRateMax) {
        send(res, 429, { error: "Слишком много заказов. Подождите немного." });
        return;
      }
      const createdAt = new Date().toISOString();
      const saved = placeOrder(createdAt, name, phone, comment, body.items, key || "");
      if (!saved.cached) recent.push(Date.now());
      send(res, 201, { id: saved.id, whatsapp: saved.whatsapp });
    } catch (error) {
      if (error && error.code === "bad_items") {
        send(res, 400, { error: "Укажите имя, телефон (+7…) и хотя бы одну позицию из витрины" });
        return;
      }
      if (error && error.code === "stock") {
        send(res, 409, { error: "Не хватает остатка по одной из позиций" });
        return;
      }
      console.error("POST /api/orders:", error && error.stack ? error.stack : error);
      send(res, 500, { error: "Не получилось сохранить заказ" });
    }
    return;
  }

  if (pathname === "/api/clients" && req.method === "GET") {
    if (!allowed(req)) {
      send(res, 401, { error: "Нужен пароль" });
      return;
    }
    const { limit, offset } = pageParams(url);
    const total = Number(countClientsAll.get().n) || 0;
    const visibleTotal = Number(countClientsVisible.get().n) || 0;
    const items = listClientsPage.all(limit, offset).map(publicClient);
    send(res, 200, { items, total, visibleTotal, limit, offset });
    return;
  }

  const clientPath = pathname.match(/^\/api\/clients\/(\d+)$/);
  if (clientPath && req.method === "PATCH") {
    if (!allowed(req)) {
      send(res, 401, { error: "Нужен пароль" });
      return;
    }
    try {
      const body = JSON.parse((await readBody(req, 8_000)).toString("utf8"));
      const current = getClient.get(clientPath[1]);
      if (!current) {
        send(res, 404, { error: "Нет такого клиента" });
        return;
      }
      const note = body.note === undefined ? current.note : cleanComment(body.note);
      const hidden = body.hidden === undefined ? current.hidden : (body.hidden ? 1 : 0);
      const status = body.status === undefined ? current.status : body.status;
      if (!orderStatuses.includes(status)) {
        send(res, 400, { error: "Нет такого состояния" });
        return;
      }
      setClient.run(note, hidden, status, current.phone);
      const saved = getClient.get(current.phone);
      send(res, 200, publicClient(saved));
    } catch {
      send(res, 400, { error: "Не получилось сохранить клиента" });
    }
    return;
  }

  if (pathname === "/api/orders" && req.method === "GET") {
    if (!allowed(req)) {
      send(res, 401, { error: "Нужен пароль" });
      return;
    }
    const { limit, offset } = pageParams(url);
    const before = Math.max(0, Math.floor(Number(url.searchParams.get("before")) || 0));
    const status = String(url.searchParams.get("status") || "all");
    const filtered = orderStatuses.includes(status);
    const total = filtered
      ? Number(countOrdersByStatus.get(status).n) || 0
      : Number(countOrdersAll.get().n) || 0;
    let rows;
    if (before > 0) {
      rows = filtered
        ? listOrdersByStatusBefore.all(status, before, limit)
        : listOrdersBefore.all(before, limit);
    } else {
      rows = filtered
        ? listOrdersByStatusPage.all(status, limit, offset)
        : listOrdersPage.all(limit, offset);
    }
    send(res, 200, {
      items: rows.map(publicOrder),
      total,
      limit,
      offset: before > 0 ? 0 : offset,
      before: before || null,
      status: filtered ? status : "all"
    });
    return;
  }

  const orderPath = pathname.match(/^\/api\/orders\/(\d+)$/);
  if (orderPath && req.method === "DELETE") {
    if (!allowed(req)) {
      send(res, 401, { error: "Нужен пароль" });
      return;
    }
    try {
      withTransaction(() => {
        const order = getOrder.get(Number(orderPath[1]));
        if (!order || deleteOrder.run(order.id).changes !== 1) failOrder("missing");
        deleteOrderKeysByOrder.run(order.id);
        // Cancelled orders already returned stock; active ones still hold it.
        if (order.status !== "cancel") adjustStock(parseOrderItemsOrFail(order.items), 1);
        syncClientFromLatest(canonPhone(order.phone));
      });
      send(res, 200, { ok: true });
    } catch (error) {
      if (error && error.code === "missing") {
        send(res, 404, { error: "Нет такого заказа" });
        return;
      }
      if (error && error.code === "corrupt_items") {
        send(res, 409, {
          error: "Не удалось прочитать состав заказа — удаление остановлено, проверьте заказ вручную"
        });
        return;
      }
      send(res, 400, { error: "Не получилось удалить заказ" });
    }
    return;
  }

  if (orderPath && req.method === "PATCH") {
    if (!allowed(req)) {
      send(res, 401, { error: "Нужен пароль" });
      return;
    }
    try {
      const body = JSON.parse((await readBody(req, 4_000)).toString("utf8"));
      const status = orderStatuses.includes(body.status) ? body.status : "";
      if (!status) {
        send(res, 400, { error: "Нет такого состояния" });
        return;
      }
      withTransaction(() => {
        const order = getOrder.get(Number(orderPath[1]));
        if (!order || setOrderStatus.run(status, order.id).changes !== 1) failOrder("missing");
        const entersCancel = order.status !== "cancel" && status === "cancel";
        const leavesCancel = order.status === "cancel" && status !== "cancel";
        if (entersCancel || leavesCancel) {
          const items = parseOrderItemsOrFail(order.items);
          if (entersCancel) adjustStock(items, 1);
          if (leavesCancel) adjustStock(items, -1);
        }
        // Только последний заказ двигает clients.status; старые PATCH не затирают
        // ручную пометку админа и не подтягивают чужой (более новый) статус.
        const phone = canonPhone(order.phone);
        const newest = latestOrder.get(phone);
        if (newest && newest.id === order.id && getClient.get(phone)) {
          setClientStatus.run(status, phone);
        }
      });
      send(res, 200, { ok: true });
    } catch (error) {
      if (error && error.code === "missing") {
        send(res, 404, { error: "Нет такого заказа" });
        return;
      }
      if (error && error.code === "stock") {
        send(res, 409, { error: "Не хватает остатка, чтобы вернуть заказ из отмены" });
        return;
      }
      if (error && error.code === "corrupt_items") {
        send(res, 409, { error: "Не удалось прочитать состав заказа — статус не изменён" });
        return;
      }
      send(res, 400, { error: "Не получилось обновить заказ" });
    }
    return;
  }

  if (pathname === "/api/products" && req.method === "GET") {
    send(res, 200, readProducts());
    return;
  }

  if (pathname === "/api/products" && req.method === "POST") {
    if (!allowed(req)) {
      send(res, 401, { error: "Нужен пароль" });
      return;
    }
    try {
      const body = JSON.parse((await readBody(req, 8_000_000)).toString("utf8"));
      const product = productFrom(body);
      if (!product) {
        send(res, 400, { error: "Укажите название и цену" });
        return;
      }
      const saved = createProduct(product);
      send(res, 201, saved);
    } catch {
      send(res, 400, { error: "Не получилось сохранить товар" });
    }
    return;
  }

  const itemPath = pathname.match(/^\/api\/products\/([a-z0-9]+)$/);
  if (itemPath && req.method === "PUT") {
    if (!allowed(req)) {
      send(res, 401, { error: "Нужен пароль" });
      return;
    }
    try {
      const body = JSON.parse((await readBody(req, 8_000_000)).toString("utf8"));
      const current = getProduct(itemPath[1]);
      if (!current) {
        send(res, 404, { error: "Нет такого товара" });
        return;
      }
      const product = productFrom(body, current);
      if (!product) {
        send(res, 400, { error: "Укажите название и цену" });
        return;
      }
      const saved = saveProduct(product);
      if (!saved) {
        send(res, 404, { error: "Нет такого товара" });
        return;
      }
      send(res, 200, saved);
    } catch {
      send(res, 400, { error: "Не получилось сохранить товар" });
    }
    return;
  }

  const removed = itemPath;
  if (removed && req.method === "DELETE") {
    if (!allowed(req)) {
      send(res, 401, { error: "Нужен пароль" });
      return;
    }
    const product = removeProduct(removed[1]);
    if (!product) {
      send(res, 404, { error: "Нет такого товара" });
      return;
    }
    removeImage(product.image);
    send(res, 200, { ok: true });
    return;
  }

  // Static: only dist/ (SPA + assets) and img/ — never the project root (configs, proofs, src).
  const imgRoot = path.join(root, "img");
  const looksLikeAsset = /\.[a-z0-9]{1,8}$/i.test(pathname);
  const wantsSpa =
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/admin" ||
    pathname === "/admin/" ||
    (req.method === "GET" && !looksLikeAsset && !pathname.startsWith("/api"));

  function underDir(file, dir) {
    const full = path.normalize(file).toLowerCase();
    const base = path.normalize(dir).toLowerCase();
    return full === base || full.startsWith(base + path.sep);
  }

  function sendFile(file) {
    fs.readFile(file, (err, data) => {
      if (err) {
        send(res, 404, "Not found", "text/plain; charset=utf-8");
        return;
      }
      send(res, 200, data, types[path.extname(file).toLowerCase()] || "application/octet-stream");
    });
  }

  if (!fs.existsSync(spaShell)) {
    if (wantsSpa) {
      send(res, 503, "Сначала соберите фронт: npm run build", "text/plain; charset=utf-8");
      return;
    }
  }

  if (pathname === "/img" || pathname.startsWith("/img/")) {
    const file = path.normalize(path.join(root, pathname.replace(/^\/+/, "")));
    if (!underDir(file, imgRoot)) {
      send(res, 403, "Forbidden", "text/plain; charset=utf-8");
      return;
    }
    fs.stat(file, (statErr, stat) => {
      if (statErr || !stat.isFile()) {
        send(res, 404, "Not found", "text/plain; charset=utf-8");
        return;
      }
      sendFile(file);
    });
    return;
  }

  const asset = path.normalize(path.join(distDir, pathname));
  if (!underDir(asset, distDir)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }
  fs.stat(asset, (statErr, stat) => {
    if (!statErr && stat.isFile()) {
      sendFile(asset);
      return;
    }
    if (wantsSpa && fs.existsSync(spaShell)) {
      sendFile(spaShell);
      return;
    }
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  });
  } catch (error) {
    console.error(
      "необработанная ошибка запроса:",
      pathname,
      error && error.stack ? error.stack : error
    );
    if (!res.writableEnded) {
      try { send(res, 500, { error: "Внутренняя ошибка сервера" }); } catch {}
    }
  }
});

server.listen(port, bindHost, () => {
  const shown = bindHost === "0.0.0.0" || bindHost === "::" ? "127.0.0.1" : bindHost;
  console.log("ready http://" + shown + ":" + port + " (bind " + bindHost + ")");
  if (bindHost !== "127.0.0.1" && bindHost !== "::1") {
    console.log("Внимание: сервер слушает не только localhost — снаружи нужен reverse proxy + TLS");
  }
  if (trustProxy) {
    console.log(
      "TRUST_PROXY=1: IP берётся из X-Forwarded-For/X-Real-IP. " +
      "Это безопасно ТОЛЬКО если перед сервером стоит свой reverse proxy, " +
      "который сам ставит этот заголовок — иначе клиент подделает IP и обойдёт " +
      "лимиты логина/заказов/чата. См. DEPLOY.md."
    );
  }
  if (!fs.existsSync(spaShell)) console.log("нет dist/ — выполните npm run build");
  if (!ai.config.apiKey) console.log("AI_API_KEY пуст — чат на локальных ответах");
});

setInterval(() => {
  try {
    backupCrm();
  } catch (error) {
    console.error("периодический бэкап CRM не удался:", error && error.message ? error.message : error);
  }
  try {
    pruneSessionsDb.run(Date.now());
  } catch (error) {
    console.error("очистка сессий не удалась:", error && error.message ? error.message : error);
  }
}, BACKUP_EVERY_MS).unref();

function shutdown() {
  server.close(() => {
    try { crm.close(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
