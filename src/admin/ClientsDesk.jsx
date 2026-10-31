import { useEffect, useState } from "react";
import { api, authHeaders, clearToken } from "../lib/api.js";
import { statusNames, when } from "./status.js";

function ClientCard({ client, onUnauthorized, onReload }) {
  const [note, setNote] = useState(client.note || "");
  const [status, setStatus] = useState(statusNames[client.status] ? client.status : "new");
  const [savedLabel, setSavedLabel] = useState("Сохранить");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    setNote(client.note || "");
    setStatus(statusNames[client.status] ? client.status : "new");
    setActionError("");
  }, [client.note, client.status, client.phone, client.hidden, client.orders]);

  useEffect(() => {
    if (savedLabel === "Сохранить") return;
    const timer = window.setTimeout(() => setSavedLabel("Сохранить"), 1200);
    return () => window.clearTimeout(timer);
  }, [savedLabel]);

  async function save(payload) {
    setBusy(true);
    setActionError("");
    const { response, data } = await api("/api/clients/" + client.phone, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });
    setBusy(false);
    if (response.status === 401) {
      clearToken();
      onUnauthorized();
      return false;
    }
    if (!response.ok) {
      setActionError(data.error || "Не получилось сохранить");
      return false;
    }
    return true;
  }

  return (
    <li data-status={status} className={client.hidden ? "is-hidden-client" : undefined}>
      <div className="crm-top">
        <strong>{client.name}</strong>
        <span className="count-pill">{client.orders} зак.</span>
      </div>
      <p className="crm-phone">+{client.phone}</p>
      <p className="crm-when">
        {client.hidden
          ? "скрыт" + (client.orders ? " · последний заказ " + when(client.lastOrderAt) : "")
          : client.orders
            ? "последний заказ " + when(client.lastOrderAt)
            : "заказов пока нет"}
      </p>
      <label className="client-note">
        Заметка
        <textarea
          rows={3}
          maxLength={300}
          placeholder="Комментарий по клиенту"
          value={note}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="crm-actions">
        <select
          aria-label="Статус клиента"
          value={status}
          disabled={busy}
          onChange={async (event) => {
            const next = event.target.value;
            const prev = status;
            setStatus(next);
            const ok = await save({ status: next });
            if (!ok) setStatus(prev);
          }}
        >
          {Object.entries(statusNames).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          className="crm-pill"
          type="button"
          disabled={busy}
          onClick={async () => {
            const ok = await save({ note });
            if (ok) setSavedLabel("Сохранено");
          }}
        >
          {savedLabel}
        </button>
        <a className="crm-pill" href={client.whatsapp} target="_blank" rel="noopener">
          WhatsApp
        </a>
        <button
          type="button"
          className={"crm-pill hide-client" + (!client.hidden ? " danger" : "")}
          disabled={busy}
          onClick={async () => {
            const ok = await save({ hidden: !client.hidden });
            if (ok) onReload();
          }}
        >
          {client.hidden ? "Вернуть" : "Скрыть"}
        </button>
      </div>
      {actionError ? <p className="note">{actionError}</p> : null}
    </li>
  );
}

export default function ClientsDesk({ clients, total, error, onUnauthorized, onReload, onLoadMore, loading = false }) {
  const hasMore = clients.length < total;

  return (
    <section className="crm-panel">
      <div className="catalog-head">
        <h2>Клиенты</h2>
      </div>
      {error ? <p className="note">{error}</p> : null}
      {!error && !clients.length ? (
        <p className="note">Пока нет клиентов. Они появятся вместе с заказом и не задвоятся, если телефон тот же.</p>
      ) : null}
      <ul className="crm-list">
        {clients.map((client) => (
          <ClientCard key={client.phone} client={client} onUnauthorized={onUnauthorized} onReload={onReload} />
        ))}
      </ul>
      {hasMore ? (
        <div className="crm-more">
          <button className="crm-pill" type="button" disabled={loading} onClick={onLoadMore}>
            {loading ? "Загрузка…" : "Ещё (" + clients.length + " из " + total + ")"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
