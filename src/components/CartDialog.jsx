import { useCallback, useEffect } from "react";
import { useCart } from "../context/CartContext.jsx";
import { useDialog } from "../hooks/useDialog.js";
import { assetUrl } from "../lib/asset.js";
import { stockOf } from "../lib/cart.js";
import { money, marks } from "../lib/money.js";

export default function CartDialog() {
  const { cart, catalog, cartOpen, setCartOpen, setOrderOpen, setQty, refreshCatalog } = useCart();
  const onClose = useCallback(() => setCartOpen(false), [setCartOpen]);
  const dialogRef = useDialog(cartOpen, onClose);

  useEffect(() => {
    if (!cartOpen) return;
    // Pull fresh limits so "+" is not stuck on an old max=1 from a cached catalog.
    refreshCatalog();
  }, [cartOpen, refreshCatalog]);

  const sums = {};
  cart.forEach((item) => {
    const code = marks[item.currency] ? item.currency : "KZT";
    sums[code] = (sums[code] || 0) + item.price * item.qty;
  });

  function lineMax(item) {
    const product = catalog.find((entry) => entry.id === item.id);
    if (product) {
      const max = stockOf(product);
      return Math.max(1, max);
    }
    const stored = Number(item.max);
    if (Number.isFinite(stored) && stored >= 1) return stored;
    // Without catalog, do not invent a higher cap than the line already has.
    return Math.max(1, item.qty || 1);
  }

  return (
    <dialog
      className="cart"
      id="cart"
      ref={dialogRef}
      aria-labelledby="cart-title"
      onClick={(event) => {
        if (event.target === dialogRef.current) setCartOpen(false);
      }}
    >
      <div className="cart-bar">
        <h2 id="cart-title">Корзина</h2>
        <button className="window-close" type="button" aria-label="Закрыть корзину" onClick={() => setCartOpen(false)}>
          ×
        </button>
      </div>
      {cart.length === 0 ? (
        <p className="note">Пока ничего не выбрано. Добавьте позицию с витрины.</p>
      ) : null}
      <ul className="cart-list">
        {cart.map((item) => {
          const max = lineMax(item);
          const atMax = item.qty >= max;
          return (
            <li key={item.id}>
              {item.image ? <img src={assetUrl(item.image)} alt={item.name} /> : <span className="no-photo">Без фото</span>}
              <div>
                <h3>{item.name}</h3>
                <p>
                  {item.qty} × {money(item.price, item.currency)}
                </p>
                <div className="cart-row">
                  <div className="stepper">
                    <button type="button" aria-label="Меньше" onClick={() => setQty(item.id, item.qty - 1)}>
                      −
                    </button>
                    <span>{item.qty}</span>
                    <button
                      type="button"
                      aria-label="Больше"
                      disabled={atMax}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (item.qty >= max) return;
                        setQty(item.id, item.qty + 1);
                      }}
                    >
                      +
                    </button>
                  </div>
                  <button type="button" className="cart-remove" onClick={() => setQty(item.id, 0)}>
                    Убрать
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="cart-foot">
        <div className="cart-totals">
          {Object.entries(sums).map(([code, sum]) => (
            <strong key={code}>Итого {money(sum, code)}</strong>
          ))}
        </div>
        <button
          className="btn gold"
          type="button"
          disabled={cart.length === 0}
          onClick={() => {
            if (!cart.length) return;
            setCartOpen(false);
            // Open after cart <dialog> closes — avoids stacked showModal() races.
            window.queueMicrotask(() => setOrderOpen(true));
          }}
        >
          Оформить заказ
        </button>
        <p className="note">Откроется заявка: имя и телефон. Заказ сохранится и уйдёт в WhatsApp.</p>
      </div>
    </dialog>
  );
}
