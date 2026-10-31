import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CART_KEY, readCart, stockOf, syncCart, writeCart } from "../lib/cart.js";

const CartContext = createContext(null);

function cartSignature(items) {
  return items
    .map((item) => [item.id, item.qty, item.price, item.currency, item.name, item.image || "", item.max ?? ""].join(":"))
    .join("|");
}

function persistCart(items) {
  writeCart(items.map(({ max: _m, ...item }) => item));
}

export function CartProvider({ children }) {
  const [catalog, setCatalog] = useState([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [cart, setCart] = useState(() => readCart());
  const [toast, setToast] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [popCart, setPopCart] = useState(false);
  const toastTimer = useRef(0);
  const popTimer = useRef(0);
  const catalogRef = useRef(catalog);
  const catalogErrorRef = useRef(catalogError);

  catalogRef.current = catalog;
  catalogErrorRef.current = catalogError;

  const refreshCatalog = useCallback(async () => {
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      if (!response.ok) throw new Error("bad status");
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("bad catalog shape");
      setCatalog(data);
      setCatalogError(false);
      setCatalogReady(true);
      return data;
    } catch {
      setCatalog([]);
      setCatalogError(true);
      setCatalogReady(true);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  // Stale prices/stock after admin edits or long idle — refresh when tab is shown again.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") refreshCatalog();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refreshCatalog]);

  useEffect(() => {
    if (!catalogReady || catalogError) return;
    setCart((prev) => {
      const next = syncCart(prev, catalog);
      if (cartSignature(prev) === cartSignature(next)) return prev;
      persistCart(next);
      return next;
    });
  }, [catalog, catalogReady, catalogError]);

  // Other tabs write localStorage; without this, a successful order in tab A leaves
  // tab B with a full cart and a fresh idempotency key → duplicate order.
  useEffect(() => {
    function onStorage(event) {
      if (event.storageArea !== localStorage) return;
      if (event.key !== CART_KEY && event.key !== null) return;
      const fromStore = readCart();
      const list = catalogRef.current;
      const next =
        list.length && !catalogErrorRef.current ? syncCart(fromStore, list) : fromStore;
      setCart((prev) => {
        if (cartSignature(prev) === cartSignature(next)) return prev;
        return next;
      });
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(popTimer.current);
    };
  }, []);

  const showToast = useCallback((text) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1600);
  }, []);

  const replaceCart = useCallback((next) => {
    const items = Array.isArray(next) ? next : [];
    persistCart(items);
    setCart(items);
  }, []);

  const setQty = useCallback((id, qty) => {
    const next = Math.floor(Number(qty));
    setCart((prev) => {
      const updated = prev
        .map((item) => {
          if (item.id !== id) return item;
          if (!Number.isFinite(next) || next < 1) return { ...item, qty: 0 };
          const product = catalog.find((entry) => entry.id === id);
          // Prefer live catalog limit; fall back to stored max only when catalog is up.
          // Without a product row, refuse to inflate past a known max (or current qty).
          const max = product
            ? stockOf(product)
            : Math.min(
                99,
                Math.max(1, Number(item.max) || item.qty || 1)
              );
          if (max < 1) return { ...item, qty: 0, max: 0 };
          return { ...item, qty: Math.min(next, max), max };
        })
        .filter((item) => item.qty >= 1);
      const synced = catalog.length && !catalogError ? syncCart(updated, catalog) : updated;
      persistCart(synced);
      return synced;
    });
  }, [catalog, catalogError]);

  const addToCart = useCallback((product, qty) => {
    const max = stockOf(product);
    if (max < 1) {
      showToast("«" + product.name + "» нет в наличии");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      const nextQty = Math.min(max, (existing ? existing.qty : 0) + qty);
      const nextCart = existing
        ? prev.map((item) => (item.id === product.id ? { ...item, qty: nextQty } : item))
        : [
            ...prev,
            {
              id: product.id,
              name: product.name,
              price: product.price,
              currency: product.currency,
              kind: product.kind,
              image: product.image || "",
              qty: Math.min(max, qty)
            }
          ];
      const synced = syncCart(nextCart, catalog.length && !catalogError ? catalog : [product]);
      persistCart(synced);
      return synced;
    });
    setPopCart(true);
    window.clearTimeout(popTimer.current);
    popTimer.current = window.setTimeout(() => setPopCart(false), 400);
    showToast("«" + product.name + "» в корзине");
  }, [catalog, catalogError, showToast]);

  const clearCart = useCallback(() => {
    writeCart([]);
    setCart([]);
  }, []);

  const count = useMemo(() => cart.reduce((sum, item) => sum + item.qty, 0), [cart]);

  const value = useMemo(
    () => ({
      catalog,
      catalogReady,
      catalogError,
      cart,
      count,
      toast,
      cartOpen,
      orderOpen,
      popCart,
      setCartOpen,
      setOrderOpen,
      refreshCatalog,
      replaceCart,
      addToCart,
      setQty,
      clearCart,
      showToast
    }),
    [
      catalog,
      catalogReady,
      catalogError,
      cart,
      count,
      toast,
      cartOpen,
      orderOpen,
      popCart,
      refreshCatalog,
      replaceCart,
      addToCart,
      setQty,
      clearCart,
      showToast
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart outside CartProvider");
  return ctx;
}
