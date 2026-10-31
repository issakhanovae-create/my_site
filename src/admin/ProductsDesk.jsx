import { useState } from "react";
import { assetUrl } from "../lib/asset.js";
import { money } from "../lib/money.js";
import { api, authHeaders, clearToken } from "../lib/api.js";

export default function ProductsDesk({ products, error, onEdit, onReload, onUnauthorized }) {
  const [busyId, setBusyId] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? products.filter((product) => {
        const hay = [product.name, product.description, product.kind, product.currency]
          .map((part) => String(part || "").toLowerCase())
          .join(" ");
        return hay.includes(needle);
      })
    : products;

  async function remove(id) {
    if (!confirm("Удалить этот товар с витрины?")) return;
    setBusyId(id);
    setActionError("");
    const { response, data } = await api("/api/products/" + id, {
      method: "DELETE",
      headers: authHeaders()
    });
    setBusyId("");
    if (response.status === 401) {
      clearToken();
      onUnauthorized();
      return;
    }
    if (!response.ok) {
      setActionError(data.error || "Не получилось удалить товар");
      return;
    }
    onReload();
  }

  async function exportPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    setActionError("");
    try {
      const { downloadCatalogPdf } = await import("../lib/pdf/downloadCatalogPdf.js");
      await downloadCatalogPdf(products);
    } catch {
      setActionError("Не получилось собрать PDF каталога");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <section className="crm-panel">
      <div className="catalog-head">
        <h2>Товары и услуги</h2>
        <div className="catalog-head-actions">
          <button className="btn pdf" type="button" disabled={pdfBusy} onClick={exportPdf}>
            {pdfBusy ? "Готовим PDF…" : "Скачать каталог PDF"}
          </button>
          <button className="btn add" type="button" onClick={() => onEdit(null)}>
            + Добавить
          </button>
        </div>
      </div>
      {products.length ? (
        <label className="catalog-search">
          <span className="sr-only">Поиск по каталогу</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию, описанию…"
          />
        </label>
      ) : null}
      {error ? <p className="note">{error}</p> : null}
      {actionError ? <p className="note">{actionError}</p> : null}
      {!error && !products.length ? <p className="note">Пока пусто — добавьте товар или услугу.</p> : null}
      {!error && products.length && !visible.length ? (
        <p className="note">Ничего не найдено по запросу «{query.trim()}».</p>
      ) : null}
      <ul className="admin-list">
        {visible.map((product) => (
          <li key={product.id}>
            {product.image ? (
              <img src={assetUrl(product.image)} alt={product.name} />
            ) : (
              <span className="no-photo">Без фото</span>
            )}
            <div>
              <strong>{product.name}</strong>
              <em>{money(product.price, product.currency)}</em>
              <span className="kind-line">{product.kind === "услуга" ? "услуга" : "товар"}</span>
              <p className="note">
                {product.kind === "услуга" || Number(product.stock) < 0
                  ? "остаток: без лимита"
                  : Number(product.stock) === 0
                    ? "остаток: нет"
                    : "остаток: " + product.stock}
                {" · макс. в заказе: " + (product.quantity || 1)}
              </p>
              <p>{product.description}</p>
              <div className="card-actions">
                <button type="button" className="edit" onClick={() => onEdit(product)}>
                  Изменить
                </button>
                <button
                  type="button"
                  className="drop"
                  disabled={busyId === product.id}
                  onClick={() => remove(product.id)}
                >
                  Удалить
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
