import { useCallback, useEffect, useRef, useState } from "react";

const SESSION_KEY = "elmira-chat-session";
const GREETING =
  "Спросите о карьере, эфире, наградах или витрине. Могу передать вас Эльмире. Кнопка «+» — любой файл до 4 МБ.";
const LINK_HOSTS = new Set([
  "wa.me",
  "www.instagram.com",
  "instagram.com",
  "www.linkedin.com",
  "linkedin.com",
  "mail.ru"
]);

const PROMPTS = [
  { ask: "Чем Эльмира занята сейчас?", label: "Сейчас" },
  { ask: "Как с ней связаться?", label: "Контакты" },
  { ask: "Что есть в магазине?", label: "Витрина" },
  { ask: "Переведите меня к Эльмире", label: "К Эльмире" }
];

let memorySessionId = "";

function chatSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY) || "";
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) {
      id =
        (crypto.randomUUID && crypto.randomUUID().replace(/-/g, "")) ||
        String(Date.now()) + Math.random().toString(36).slice(2);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    memorySessionId = id;
    return id;
  } catch {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(memorySessionId)) {
      memorySessionId =
        (crypto.randomUUID && crypto.randomUUID().replace(/-/g, "")) ||
        String(Date.now()) + Math.random().toString(36).slice(2);
    }
    return memorySessionId;
  }
}

function friendlyError(error, fallback) {
  const raw = String((error && error.message) || "").trim();
  if (!raw || /failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    return fallback || "Нет связи с сайтом. Проверьте интернет и попробуйте ещё раз.";
  }
  return raw;
}

function RichText({ text }) {
  const nodes = [];
  const pattern = /https?:\/\/[^\s]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
  let cursor = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) {
      nodes.push(<span key={key++}>{text.slice(cursor, match.index)}</span>);
    }
    let raw = match[0];
    let tail = "";
    while (/[),.;]$/.test(raw)) {
      tail = raw.slice(-1) + tail;
      raw = raw.slice(0, -1);
    }
    const mail = raw.includes("@") && !/^https?:\/\//i.test(raw);
    let safe = false;
    if (mail) safe = true;
    else {
      try {
        const url = new URL(raw);
        safe = url.protocol === "https:" && LINK_HOSTS.has(url.hostname.toLowerCase());
      } catch {
        safe = false;
      }
    }
    if (safe) {
      nodes.push(
        <a
          key={key++}
          href={mail ? "mailto:" + raw : raw}
          {...(mail ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        >
          {raw}
        </a>
      );
    } else {
      nodes.push(<span key={key++}>{raw}</span>);
    }
    if (tail) nodes.push(<span key={key++}>{tail}</span>);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(<span key={key++}>{text.slice(cursor)}</span>);
  return <>{nodes}</>;
}

export default function ConsultChat() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [passNext, setPassNext] = useState(false);
  const [passToken, setPassToken] = useState("");
  const [attached, setAttached] = useState(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [input, setInput] = useState("");
  const [height, setHeight] = useState(560);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const plusRef = useRef(null);
  const attachPopRef = useRef(null);
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const motionTimer = useRef(0);
  const pendingRef = useRef(false);
  const passNextRef = useRef(false);
  const passTokenRef = useRef("");
  const attachedRef = useRef(null);
  const abortRef = useRef(null);
  const fileReadGen = useRef(0);

  useEffect(() => {
    passNextRef.current = passNext;
  }, [passNext]);
  useEffect(() => {
    passTokenRef.current = passToken;
  }, [passToken]);
  useEffect(() => {
    attachedRef.current = attached;
  }, [attached]);

  function scrollLog() {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }

  useEffect(() => {
    scrollLog();
  }, [messages, open]);

  function applyHeight(value) {
    const max = Math.max(420, Math.min(840, window.innerHeight - 48));
    const next = Math.min(Math.max(Number(value) || 560, 360), max);
    setHeight(next);
    return next;
  }

  useEffect(() => {
    function onResize() {
      setHeight((prev) => {
        const max = Math.max(420, Math.min(840, window.innerHeight - 48));
        return Math.min(Math.max(prev, 360), max);
      });
    }
    function onViewport() {
      onResize();
    }
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onViewport);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onViewport);
    };
  }, []);

  const cancelInflight = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const setPanelOpen = useCallback(
    (on) => {
      window.clearTimeout(motionTimer.current);
      if (on) {
        setClosing(false);
        setOpen(true);
        setMessages((prev) => (prev.length ? prev : [{ id: "greet", who: "bot", text: GREETING }]));
        window.setTimeout(() => inputRef.current?.focus(), 360);
        return;
      }
      cancelInflight();
      setOpen(false);
      setClosing(true);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        setClosing(false);
        return;
      }
      motionTimer.current = window.setTimeout(() => setClosing(false), 320);
    },
    [cancelInflight]
  );

  useEffect(() => {
    return () => {
      window.clearTimeout(motionTimer.current);
      cancelInflight();
    };
  }, [cancelInflight]);

  useEffect(() => {
    if (!open && !closing) return;
    function onKey(event) {
      if (event.key !== "Escape") return;
      if (attachOpen) {
        setAttachOpen(false);
        return;
      }
      setPanelOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closing, attachOpen, setPanelOpen]);

  useEffect(() => {
    if (!attachOpen) return;
    function onDoc(event) {
      if (attachPopRef.current?.contains(event.target)) return;
      if (plusRef.current?.contains(event.target)) return;
      setAttachOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [attachOpen]);

  useEffect(() => {
    if (!open) setAttachOpen(false);
  }, [open]);

  function growInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }

  async function ask(text) {
    const question = String(text || "").trim();
    const file = attachedRef.current;
    if ((!question && !file) || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    const handingOff = passNextRef.current && !file;
    const userId = "u-" + Date.now();
    const waitId = "w-" + Date.now();
    // В ленту только имя: preview/data URL — это тот же base64 и раздувает RAM.
    const fileMeta = file ? { name: file.name } : null;
    setMessages((prev) => [
      ...prev,
      { id: userId, who: "user", text: question, file: fileMeta },
      { id: waitId, who: "bot wait", text: "Слушаю…" }
    ]);
    setInput("");
    setAttached(null);
    attachedRef.current = null;
    if (fileRef.current) fileRef.current.value = "";
    window.setTimeout(growInput, 0);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          message: question,
          sessionId: chatSessionId(),
          mode: handingOff ? "pass" : "chat",
          passToken: handingOff ? passTokenRef.current : undefined,
          file: file ? { name: file.name, type: file.type, data: file.data } : undefined
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(data.error || (response.status === 429 ? "Слишком много вопросов. Подождите минуту." : "Не получилось ответить"));
        throw err;
      }
      const expectPass = data.expect === "pass";
      setPassNext(expectPass);
      passNextRef.current = expectPass;
      setPassToken(data.passToken || "");
      passTokenRef.current = data.passToken || "";
      setMessages((prev) => {
        const next = prev.filter((item) => item.id !== waitId);
        // degraded = модель реально подвела (сбой/лимит), а не просто "ключа нет" —
        // пользователь должен видеть, что это временный откат, а не обычный ответ бота.
        if (data.source === "local" && data.degraded) {
          next.push({
            id: "note-" + Date.now(),
            who: "note",
            text: "AI-консультант сейчас недоступен, отвечаю по справочнику."
          });
        }
        if (data.whatsapp && String(data.whatsapp).startsWith("https://wa.me/")) {
          next.push({
            id: "pass-" + Date.now(),
            who: "pass",
            text: data.reply || "Можно писать Эльмире.",
            href: data.whatsapp
          });
        } else {
          next.push({ id: "b-" + Date.now(), who: "bot", text: data.reply || "Пока без ответа.", rich: true });
        }
        return next;
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        setMessages((prev) => prev.filter((item) => item.id !== waitId));
      } else {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === waitId ? { ...item, who: "bot", text: friendlyError(error) } : item
          )
        );
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      pendingRef.current = false;
      setPending(false);
      if (open) inputRef.current?.focus();
    }
  }

  function clearAttached() {
    fileReadGen.current += 1;
    setAttached(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 4_000_000) {
      clearAttached();
      setAttachOpen(false);
      setMessages((prev) => [...prev, { id: "err-" + Date.now(), who: "bot", text: "Файл больше 4 МБ. Выберите поменьше." }]);
      return;
    }
    const gen = ++fileReadGen.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (gen !== fileReadGen.current) return;
      const result = String(reader.result || "");
      const data = result.slice(result.indexOf(",") + 1);
      setAttached({
        name: file.name,
        type: file.type || "application/octet-stream",
        data
      });
      setAttachOpen(true);
    };
    reader.onerror = () => {
      if (gen !== fileReadGen.current) return;
      clearAttached();
      setAttachOpen(false);
      setMessages((prev) => [
        ...prev,
        { id: "err-" + Date.now(), who: "bot", text: "Не получилось прочитать файл. Попробуйте другой." }
      ]);
    };
    reader.readAsDataURL(file);
  }

  function sendAttached() {
    setAttachOpen(false);
    ask(input);
  }

  const panelVisible = open || closing;
  const rootClass = "consult" + (open ? " is-open" : "") + (closing ? " is-closing" : "");

  return (
    <div className={rootClass}>
      <section
        className="consult-panel"
        id="consult-panel"
        ref={panelRef}
        hidden={!panelVisible}
        aria-labelledby="consult-title"
        aria-busy={pending}
        style={{ "--consult-h": height + "px" }}
      >
        <button
          className="consult-resize"
          type="button"
          role="slider"
          aria-label="Высота чата. Тяните вверх или вниз"
          aria-valuemin={360}
          aria-valuemax={840}
          aria-valuenow={Math.round(height)}
          aria-orientation="vertical"
          onPointerDown={(event) => {
            event.preventDefault();
            dragRef.current = { y: event.clientY, h: panelRef.current.getBoundingClientRect().height };
            event.currentTarget.classList.add("is-drag");
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {}
          }}
          onPointerMove={(event) => {
            if (!dragRef.current) return;
            applyHeight(dragRef.current.h + (dragRef.current.y - event.clientY));
          }}
          onPointerUp={(event) => {
            if (!dragRef.current) return;
            dragRef.current = null;
            event.currentTarget.classList.remove("is-drag");
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={(event) => {
            dragRef.current = null;
            event.currentTarget.classList.remove("is-drag");
          }}
          onKeyDown={(event) => {
            const current = panelRef.current?.getBoundingClientRect().height || height;
            if (event.key === "ArrowUp") {
              event.preventDefault();
              applyHeight(current + 32);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              applyHeight(current - 32);
            }
          }}
        >
          <span />
        </button>
        <header className="consult-bar">
          <div>
            <h2 id="consult-title">AI-консультант</h2>
            <p className="consult-sub">Elmira Bot</p>
          </div>
          <button className="window-close" type="button" aria-label="Закрыть" onClick={() => setPanelOpen(false)}>
            ×
          </button>
        </header>
        <div className="consult-log" ref={logRef} aria-live="polite" aria-relevant="additions">
          {messages.map((msg) => {
            if (msg.who === "pass") {
              return (
                <div className="consult-pass" key={msg.id}>
                  <p className="consult-msg bot">{msg.text}</p>
                  <a className="btn gold" href={msg.href} target="_blank" rel="noopener noreferrer">
                    Написать Эльмире
                  </a>
                </div>
              );
            }
            if (msg.who === "user") {
              return (
                <div className="consult-msg user" key={msg.id}>
                  {msg.file ? <p>{msg.file.name}</p> : null}
                  {msg.text ? <p>{msg.text}</p> : null}
                </div>
              );
            }
            return (
              <p className={"consult-msg " + msg.who} key={msg.id}>
                {msg.rich ? <RichText text={msg.text} /> : msg.text}
              </p>
            );
          })}
        </div>
        <div className="consult-prompts">
          {PROMPTS.map((item) => (
            <button key={item.label} type="button" onClick={() => ask(item.ask)} disabled={pending}>
              {item.label}
            </button>
          ))}
        </div>
        <form
          className="consult-form"
          onSubmit={(event) => {
            event.preventDefault();
            ask(input);
          }}
        >
          {attached ? (
            <div className="consult-chip">
              <span>{attached.name}</span>
              <button type="button" onClick={clearAttached}>
                убрать
              </button>
            </div>
          ) : null}
          <div className="consult-attach">
            <button
              className={"consult-plus" + (attachOpen ? " is-open" : "") + (attached ? " has-file" : "")}
              type="button"
              ref={plusRef}
              aria-label="Прикрепить файл"
              aria-expanded={attachOpen}
              aria-controls="consult-attach-pop"
              disabled={pending}
              onClick={() => setAttachOpen((prev) => !prev)}
            >
              +
            </button>
            {attachOpen ? (
              <div className="consult-attach-pop" id="consult-attach-pop" ref={attachPopRef} role="dialog" aria-label="Отправка файла">
                <p className="consult-attach-kicker">Файл</p>
                <p className="consult-attach-hint">Любой тип · до 4 МБ</p>
                <button
                  className="consult-attach-pick"
                  type="button"
                  disabled={pending}
                  onClick={() => fileRef.current?.click()}
                >
                  Выбрать файл
                </button>
                {attached ? (
                  <div className="consult-attach-ready">
                    <span title={attached.name}>{attached.name}</span>
                    <div className="consult-attach-actions">
                      <button type="button" className="btn gold" disabled={pending} onClick={sendAttached}>
                        Отправить
                      </button>
                      <button type="button" className="consult-attach-clear" disabled={pending} onClick={clearAttached}>
                        Убрать
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="consult-compose">
            <textarea
              ref={inputRef}
              rows={1}
              maxLength={800}
              aria-label="Вопрос"
              placeholder="Спросите о карьере, эфире или витрине"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                growInput();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  ask(input);
                }
              }}
            />
          </div>
          <input ref={fileRef} type="file" hidden onChange={onFileChange} />
          <button className="btn gold" type="submit" disabled={pending}>
            Спросить
          </button>
        </form>
      </section>
      <button
        className="consult-launch"
        type="button"
        aria-expanded={open}
        aria-controls="consult-panel"
        tabIndex={open ? -1 : 0}
        aria-hidden={open ? true : undefined}
        onClick={() => setPanelOpen(true)}
      >
        <span className="lamp" aria-hidden="true" />
        AI-консультант
      </button>
    </div>
  );
}
