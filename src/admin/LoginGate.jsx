import { useState } from "react";
import { api, setToken } from "../lib/api.js";

export default function LoginGate({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      const { response, data } = await api("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!response.ok) {
        setNote(
          response.status === 0
            ? "Нет связи с сайтом"
            : response.status === 429
              ? "Слишком много попыток. Подождите."
              : "Неверный пароль"
        );
        return;
      }
      if (!data.token) {
        setNote("Не получилось войти");
        return;
      }
      setToken(data.token);
      setNote("");
      setPassword("");
      setShow(false);
      onSuccess();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <h2>Вход</h2>
      <label>
        Пароль
        <span className="pass-row">
          <input
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={busy}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            className={"eye" + (show ? " is-open" : "")}
            type="button"
            aria-label={show ? "Скрыть пароль" : "Показать пароль"}
            aria-pressed={show}
            disabled={busy}
            onClick={() => setShow((v) => !v)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path className="eye-slash" d="M4 19L20 5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </span>
      </label>
      <button className="btn gold" type="submit" disabled={busy}>
        {busy ? "Вхожу…" : "Войти"}
      </button>
      <p className="form-note">{note}</p>
    </form>
  );
}
