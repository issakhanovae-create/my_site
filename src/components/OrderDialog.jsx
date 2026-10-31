import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "../context/CartContext.jsx";
import { useDialog } from "../hooks/useDialog.js";
import { clearOrderKey, ensureOrderKey, syncCart } from "../lib/cart.js";

export default function OrderDialog() {
  const {
    cart,
    orderOpen,
    setOrderOpen,
    setCartOpen,
    clearCart,
    replaceCart,
    showToast,
    refreshCatalog,
    catalogError
  } = useCart();
  const onClose = useCallback(() => setOrderOpen(false), [setOrderOpen]);
  const dialogRef = useDialog(orderOpen, onClose);
  const nameRef = useRef(null);
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const orderKey = useRef("");

  useEffect(() => {
    if (!orderOpen) return;
    // Keep the same key until a successful submit clears it — avoids duplicate orders
    // when the server saved but the client lost the response or the dialog was closed.
    // Key is bound to cart signature (see ensureOrderKey); refreshed again on submit.
    // Only reset UI when the dialog opens — not when clearCart() runs after success
    // (otherwise the WhatsApp fallback link would be wiped).
    orderKey.current = ensureOrderKey(cart);
    setStatus(null);
    setSending(false);
    refreshCatalog();
    window.setTimeout(() => nameRef.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open transition only
  }, [orderOpen]);

  async function onSubmit(event) {
    event.preventDefault();
    if (!cart.length || sending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setSending(true);
    setStatus({ type: "text", text: "Проверяю витрину…" });
    try {
      const list = await refreshCatalog();
      if (list === null) {
        setStatus({
          type: "text",
          text: "Не получилось обновить витрину. Проверьте связь и попробуйте ещё раз."
        });
        setSending(false);
        return;
      }
      const items = syncCart(cart, list);
      replaceCart(items);
      if (!items.length) {
        setStatus({
          type: "text",
          text: "В корзине не осталось доступных позиций. Обновите состав и попробуйте снова."
        });
        setSending(false);
        return;
      }
      const key = ensureOrderKey(items);
      orderKey.current = key;
      setStatus({ type: "text", text: "Сохраняю заказ…" });
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          phone: data.get("phone"),
          comment: data.get("comment"),
          idempotencyKey: key,
          items: items.map((item) => ({ id: item.id, qty: item.qty }))
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !String(payload.whatsapp || "").startsWith("https://wa.me/")) {
        setStatus({
          type: "text",
          text: payload.error || (response.status === 409 ? "Не хватает остатка" : "Не получилось сохранить заказ")
        });
        setSending(false);
        if (response.status === 409) refreshCatalog();
        return;
      }
      clearCart();
      clearOrderKey();
      form.reset();
      orderKey.current = "";
      setSending(false);
      setCartOpen(false);
      refreshCatalog();
      const opened = window.open(payload.whatsapp, "_blank", "noopener");
      if (opened) {
        setOrderOpen(false);
        showToast("Заказ №" + payload.id + " сохранён");
        return;
      }
      setStatus({
        type: "link",
        id: payload.id,
        href: payload.whatsapp
      });
    } catch {
      setStatus({ type: "text", text: "Нет связи с сайтом. Заказ не сохранён." });
      setSending(false);
    }
  }

  return (
    <dialog
      className="order-modal"
      id="order-request"
      ref={dialogRef}
      aria-labelledby="order-title"
      onClick={(event) => {
        if (event.target === dialogRef.current) setOrderOpen(false);
      }}
    >
      <div className="cart-bar">
        <h2 id="order-title">Заявка</h2>
        <button className="window-close" type="button" aria-label="Закрыть заявку" onClick={() => setOrderOpen(false)}>
          ×
        </button>
      </div>
      <p className="note">Напишите, как к вам обращаться. После заявки откроется WhatsApp.</p>
      <form className="cart-client" onSubmit={onSubmit}>
        <label>
          Имя
          <input ref={nameRef} name="name" required minLength={2} maxLength={80} autoComplete="name" />
        </label>
        <label>
          Номер телефона
          <input
            name="phone"
            required
            minLength={10}
            maxLength={24}
            autoComplete="tel"
            inputMode="tel"
            placeholder="+7 700 000 00 00"
            pattern="(\+?7|8)[\d\s()\-]{9,20}"
          />
        </label>
        <label>
          Комментарий
          <textarea name="comment" maxLength={300} rows={2} placeholder="Необязательно" />
        </label>
        <button className="btn gold" type="submit" disabled={sending || !cart.length || catalogError}>
          Отправить заявку
        </button>
        <p className="note">
          {catalogError && !status ? "Сначала обновите витрину — без неё заявку отправить нельзя." : null}
          {status?.type === "text" ? status.text : null}
          {status?.type === "link" ? (
            <>
              Заказ №{status.id} сохранён.{" "}
              <a href={status.href} target="_blank" rel="noopener">
                Открыть WhatsApp
              </a>
            </>
          ) : null}
        </p>
      </form>
    </dialog>
  );
}
