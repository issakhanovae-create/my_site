import { useState } from "react";
import { money } from "../lib/money.js";
import { api, authHeaders, clearToken } from "../lib/api.js";
import { clientChat, statusNames, when } from "./status.js";

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "new", label: "Новые" },
  { id: "work", label: "В работе" },
  { id: "done", label: "Готово" },
  { id: "cancel", label: "Отмена" }
];

export default function OrdersDesk({
  orders,
  total,
  filter,
  error,
  onFilter,
  onLoadMore,
  onReload,
  onUnauthorized,
  onClientsReload,
  loading = false
}) {
  const [busyId, setBusyId] = useState("");
  const [pdfBusyId, setPdfBusyId] = useState("");
  const [actionError, setActionError] = useState("");

  const emptyText = error
    ? error
    : !orders.length
      ? "Пока нет заказов. Они появятся, когда клиент отправит корзину в WhatsApp."
      : "Нет заказов с этим статусом.";

  const hasMore = orders.length < total;

  async function updateStatus(id, status) {
    setBusyId(id);
    setActionError("");
    const { response, data } = await api("/api/orders/" + id, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status })
    });
    setBusyId("");
    if (response.status === 401) {
      clearToken();
      onUnauthorized();
      return false;
    }
    if (!response.ok) {
      setActionError(data.error || "Не получилось сменить статус заказа №" + id);
      return false;
    }
    await onReload();
    onClientsReload();
    return true;
  }

  async function removeOrder(id) {
    if (!confirm("Удалить заказ №" + id + " безвозвратно?")) return;
    setBusyId(id);
    setActionError("");
    const { response, data } = await api("/api/orders/" + id, {
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
      setActionError(data.error || "Не получилось удалить заказ №" + id);
      return;
    }
    await onReload();
    onClientsReload();
  }

  async function exportInvoice(order) {
    if (busyId || pdfBusyId) return;
    setPdfBusyId(order.id);
    setActionError("");
    try {
      const [{ downloadInvoicePdf }, { companyHasPlaceholders }] = await Promise.all([
        import("../lib/pdf/downloadInvoicePdf.js"),
        import("../data/company.js")
      ]);
      if (
        companyHasPlaceholders() &&
        !window.confirm(
          "В реквизитах продавца ещё остались плейсхолдеры «ЗАМЕНИТЬ:» (src/data/company.js). Всё равно скачать счёт?"
        )
      ) {
        return;
      }
      await downloadInvoicePdf(order);
    } catch {
      setActionError("Не получилось собрать PDF счёта №" + order.id);
    } finally {
      setPdfBusyId("");
    }
  }

  return (
    <section className="crm-panel">
      <div className="catalog-head">
        <h2>Заказы</h2>
        <div className="order-filters" role="tablist">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? "is-on" : undefined}
              aria-pressed={filter === item.id}
              onClick={() => onFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {actionError ? <p className="note">{actionError}</p> : null}
      {orders.length === 0 ? <p className="note">{emptyText}</p> : null}
      <ul className="crm-list">
        {orders.map((order) => {
          const totals = (order.totals || []).map((line) => money(line.sum, line.currency)).join(", ");
          const busy = busyId === order.id || pdfBusyId === order.id;
          const pdfBusy = pdfBusyId === order.id;
          return (
            <li key={order.id} data-status={order.status}>
              <div className="crm-top">
                <strong>#{order.id} · корзина</strong>
                <span className="status-pill">{statusNames[order.status] || "Новый"}</span>
              </div>
              <p className="crm-person">{order.name}</p>
              <p className="crm-phone">+{order.phone}</p>
              <time className="crm-when" dateTime={order.createdAt}>
                {when(order.createdAt)}
              </time>
              <ul className="crm-items">
                {(order.items || []).map((line, index) => (
                  <li key={(line.id || line.name) + "-" + index}>
                    <span>{line.name}</span>
                    <b>
                      {line.qty} × {money(line.price, line.currency)}
                    </b>
                  </li>
                ))}
              </ul>
              {totals ? <p className="crm-total">{totals}</p> : null}
              {order.comment ? <p className="crm-comment">{order.comment}</p> : null}
              <div className="crm-actions">
                <select
                  aria-label="Статус заказа"
                  value={order.status}
                  disabled={busy}
                  onChange={(event) => {
                    updateStatus(order.id, event.target.value);
                  }}
                >
                  {Object.entries(statusNames).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <a className="crm-pill" href={clientChat(order)} target="_blank" rel="noopener">
                  WhatsApp
                </a>
                <button
                  type="button"
                  className="crm-pill"
                  disabled={busy}
                  onClick={() => exportInvoice(order)}
                >
                  {pdfBusy ? "Готовим PDF…" : "Счёт-фактура PDF"}
                </button>
                <button
                  type="button"
                  className="crm-pill danger drop-order"
                  disabled={busy}
                  onClick={() => removeOrder(order.id)}
                >
                  Удалить
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <div className="crm-more">
          <button className="crm-pill" type="button" disabled={loading} onClick={onLoadMore}>
            {loading ? "Загрузка…" : "Ещё (" + orders.length + " из " + total + ")"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
