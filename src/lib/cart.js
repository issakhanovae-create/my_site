export const CART_KEY = "elmira-cart";
export const ORDER_KEY = "elmira-order-key";

function maxPerOrder(product) {
  const qty = Math.floor(Number(product && product.quantity));
  if (!Number.isFinite(qty) || qty < 1) return 1;
  return Math.min(99, qty);
}

/** How many units can go in the cart now: min(max-per-order, warehouse stock). stock < 0 = unlimited. */
export function stockOf(product) {
  const cap = maxPerOrder(product);
  const stock = Number(product && product.stock);
  if (Number.isFinite(stock) && stock >= 0) return Math.min(cap, Math.max(0, Math.floor(stock)));
  return cap;
}

export function isUnlimitedStock(product) {
  const stock = Number(product && product.stock);
  return !Number.isFinite(stock) || stock < 0;
}

export function readCart() {
  try {
    const data = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function writeCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    // Quota / private mode — keep in-memory cart; next successful write may recover.
  }
}

export function syncCart(cart, catalog) {
  return cart
    .map((item) => {
      const product = catalog.find((entry) => entry.id === item.id);
      if (!product) return null;
      const max = stockOf(product);
      if (max < 1) return null;
      return {
        id: product.id,
        name: product.name,
        price: product.price,
        currency: product.currency,
        kind: product.kind,
        image: product.image || "",
        qty: Math.min(Math.max(1, item.qty), max),
        max
      };
    })
    .filter(Boolean);
}

export function newOrderKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "ord-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function cartOrderSignature(cart) {
  if (!Array.isArray(cart) || !cart.length) return "";
  return cart
    .map((item) => String(item.id) + ":" + String(Math.floor(Number(item.qty)) || 0))
    .sort()
    .join("|");
}

function readOrderKeyRaw() {
  try {
    const fromLocal = localStorage.getItem(ORDER_KEY);
    if (fromLocal) return fromLocal;
    // Migrate legacy per-tab keys so an in-flight retry still matches.
    const fromSession = sessionStorage.getItem(ORDER_KEY);
    if (fromSession) {
      localStorage.setItem(ORDER_KEY, fromSession);
      sessionStorage.removeItem(ORDER_KEY);
      return fromSession;
    }
  } catch {}
  return "";
}

function readStoredOrderAttempt(signature) {
  try {
    const raw = readOrderKeyRaw();
    if (!raw) return "";
    // Legacy plain-string keys from earlier builds — drop them.
    if (raw.charAt(0) !== "{") {
      clearOrderKey();
      return "";
    }
    const data = JSON.parse(raw);
    const key = String(data && data.key || "").trim();
    const sig = String(data && data.sig || "");
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) return "";
    if (sig !== signature) return "";
    return key;
  } catch {
    return "";
  }
}

export function clearOrderKey() {
  try {
    localStorage.removeItem(ORDER_KEY);
  } catch {}
  try {
    sessionStorage.removeItem(ORDER_KEY);
  } catch {}
}

/**
 * Reuse the pending key across retries / tabs / dialog reopen until the order succeeds.
 * Bound to cart id:qty signature so a changed cart never reuses an old attempt key
 * (server would otherwise return the cached first order and clear the new cart).
 * Stored in localStorage so parallel tabs share one idempotency key.
 */
export function ensureOrderKey(cart) {
  const signature = cartOrderSignature(cart);
  if (!signature) {
    clearOrderKey();
    return newOrderKey();
  }
  const existing = readStoredOrderAttempt(signature);
  if (existing) return existing;
  const key = newOrderKey();
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify({ key, sig: signature }));
    sessionStorage.removeItem(ORDER_KEY);
  } catch {}
  return key;
}
