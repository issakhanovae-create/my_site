import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import LoginGate from "../admin/LoginGate.jsx";
import ProductsDesk from "../admin/ProductsDesk.jsx";
import OrdersDesk from "../admin/OrdersDesk.jsx";
import ClientsDesk from "../admin/ClientsDesk.jsx";
import ProductDialog from "../admin/ProductDialog.jsx";
import { api, authHeaders, clearToken, getToken } from "../lib/api.js";

const DESK_TITLES = { shop: "Товары и услуги", crm: "Заказы", clients: "Клиенты" };
const PAGE = 40;

function pageItems(data) {
  if (Array.isArray(data)) return data;
  return Array.isArray(data && data.items) ? data.items : [];
}

function mergeByKey(prev, items, keyOf) {
  const seen = new Set(prev.map(keyOf));
  const extra = items.filter((item) => !seen.has(keyOf(item)));
  return extra.length ? prev.concat(extra) : prev;
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState("shop");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersFilter, setOrdersFilter] = useState("all");
  const [clients, setClients] = useState([]);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [clientsVisible, setClientsVisible] = useState(0);
  const [productsError, setProductsError] = useState("");
  const [ordersError, setOrdersError] = useState("");
  const [clientsError, setClientsError] = useState("");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const ordersBusy = useRef(false);
  const clientsBusy = useRef(false);
  const ordersReq = useRef(0);
  const clientsReq = useRef(0);

  useEffect(() => {
    document.title = "Админка — витрина и заказы";
    document.body.classList.add("crm-page");
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content = "noindex";
    return () => {
      document.body.classList.remove("crm-page");
      robots?.remove();
    };
  }, []);

  const lock = useCallback(() => {
    clearToken();
    setAuthed(false);
    setProducts([]);
    setOrders([]);
    setOrdersTotal(0);
    setOrdersFilter("all");
    setClients([]);
    setClientsTotal(0);
    setClientsVisible(0);
    setProductsError("");
    setOrdersError("");
    setClientsError("");
    setDialogOpen(false);
    setEditing(null);
  }, []);

  const loadProducts = useCallback(async () => {
    const { response, data } = await api("/api/products", { cache: "no-store" });
    if (response.ok && Array.isArray(data)) {
      setProducts(data);
      setProductsError("");
      return;
    }
    setProducts([]);
    setProductsError(data.error || "Не получилось загрузить товары.");
  }, []);

  const loadOrders = useCallback(async (opts = {}) => {
    const append = !!opts.append;
    if (append && ordersBusy.current) return;
    const gen = ++ordersReq.current;
    ordersBusy.current = true;
    setOrdersLoading(true);
    const filter = opts.filter ?? "all";
    const before = append ? Number(opts.before) || 0 : 0;
    const query = new URLSearchParams({ limit: String(PAGE) });
    if (before > 0) query.set("before", String(before));
    else query.set("offset", "0");
    if (filter && filter !== "all") query.set("status", filter);
    try {
      const { response, data } = await api("/api/orders?" + query, { headers: authHeaders() });
      if (gen !== ordersReq.current) return;
      if (response.status === 401) {
        lock();
        return;
      }
      if (response.ok) {
        const items = pageItems(data);
        setOrders((prev) => (append ? mergeByKey(prev, items, (o) => o.id) : items));
        setOrdersTotal(Number(data && data.total) || items.length);
        setOrdersFilter(filter);
        setOrdersError("");
        return;
      }
      if (!append) {
        setOrders([]);
        setOrdersTotal(0);
      }
      setOrdersError(data.error || "Не получилось загрузить заказы.");
    } finally {
      if (gen === ordersReq.current) {
        ordersBusy.current = false;
        setOrdersLoading(false);
      }
    }
  }, [lock]);

  const loadClients = useCallback(async (opts = {}) => {
    const append = !!opts.append;
    if (append && clientsBusy.current) return;
    const gen = ++clientsReq.current;
    clientsBusy.current = true;
    setClientsLoading(true);
    const offset = append ? Number(opts.offset) || 0 : 0;
    const query = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    try {
      const { response, data } = await api("/api/clients?" + query, { headers: authHeaders() });
      if (gen !== clientsReq.current) return;
      if (response.status === 401) {
        lock();
        return;
      }
      if (response.ok) {
        const items = pageItems(data);
        setClients((prev) => (append ? mergeByKey(prev, items, (c) => c.phone) : items));
        setClientsTotal(Number(data && data.total) || items.length);
        setClientsVisible(Number(data && data.visibleTotal) || items.filter((c) => !c.hidden).length);
        setClientsError("");
        return;
      }
      if (!append) {
        setClients([]);
        setClientsTotal(0);
        setClientsVisible(0);
      }
      setClientsError(data.error || "Не получилось загрузить клиентов.");
    } finally {
      if (gen === clientsReq.current) {
        clientsBusy.current = false;
        setClientsLoading(false);
      }
    }
  }, [lock]);

  const enterDesk = useCallback(() => {
    setAuthed(true);
    loadProducts();
    loadOrders({ filter: "all" });
    loadClients();
  }, [loadProducts, loadOrders, loadClients]);

  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setChecking(false);
      return;
    }
    api("/api/session", { headers: authHeaders() })
      .then(({ response }) => {
        if (cancelled) return;
        if (response.ok) enterDesk();
        else clearToken();
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enterDesk]);

  async function logout() {
    try {
      await api("/api/logout", { method: "POST", headers: authHeaders() });
    } catch {}
    lock();
  }

  function closeProductDialog() {
    setDialogOpen(false);
    setEditing(null);
  }

  if (checking) {
    return <main className="admin" />;
  }

  return (
    <main className="admin">
      {!authed ? (
        <LoginGate onSuccess={enterDesk} />
      ) : (
        <div>
          <header className="crm-bar">
            <div>
              <p className="label">CRM</p>
              <h1 className="crm-title">{DESK_TITLES[tab] || "CRM"}</h1>
            </div>
            <div className="crm-bar-actions">
              <Link className="crm-pill" to="/">
                Смотреть магазин
              </Link>
              <button className="crm-pill" type="button" onClick={logout}>
                Выйти
              </button>
            </div>
          </header>
          <div className="desk-tabs" role="tablist">
            <button
              type="button"
              className={tab === "shop" ? "is-on" : undefined}
              aria-pressed={tab === "shop"}
              onClick={() => {
                setTab("shop");
                loadProducts();
              }}
            >
              Витрина
            </button>
            <button
              type="button"
              className={tab === "crm" ? "is-on" : undefined}
              aria-pressed={tab === "crm"}
              onClick={() => {
                setTab("crm");
                loadOrders({ filter: ordersFilter });
              }}
            >
              Заказы <b>{ordersTotal}</b>
            </button>
            <button
              type="button"
              className={tab === "clients" ? "is-on" : undefined}
              aria-pressed={tab === "clients"}
              onClick={() => {
                setTab("clients");
                loadClients();
              }}
            >
              Клиенты <b>{clientsVisible}</b>
            </button>
          </div>
          {tab === "shop" ? (
            <ProductsDesk
              products={products}
              error={productsError}
              onEdit={(product) => {
                setEditing(product);
                setDialogOpen(true);
              }}
              onReload={loadProducts}
              onUnauthorized={lock}
            />
          ) : null}
          {tab === "crm" ? (
            <OrdersDesk
              orders={orders}
              total={ordersTotal}
              filter={ordersFilter}
              error={ordersError}
              loading={ordersLoading}
              onFilter={(next) => loadOrders({ filter: next })}
              onLoadMore={() => {
                const last = orders[orders.length - 1];
                if (!last) return;
                loadOrders({ filter: ordersFilter, before: last.id, append: true });
              }}
              onReload={() => loadOrders({ filter: ordersFilter })}
              onClientsReload={() => loadClients()}
              onUnauthorized={lock}
            />
          ) : null}
          {tab === "clients" ? (
            <ClientsDesk
              clients={clients}
              total={clientsTotal}
              error={clientsError}
              loading={clientsLoading}
              onLoadMore={() => loadClients({ offset: clients.length, append: true })}
              onReload={() => loadClients()}
              onUnauthorized={lock}
            />
          ) : null}
        </div>
      )}
      <ProductDialog
        open={dialogOpen}
        product={editing}
        onClose={closeProductDialog}
        onSaved={loadProducts}
        onUnauthorized={lock}
      />
    </main>
  );
}
