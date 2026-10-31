import { useEffect, useState } from "react";
import { useCart } from "../context/CartContext.jsx";
import { assetUrl } from "../lib/asset.js";
import { isUnlimitedStock, stockOf } from "../lib/cart.js";
import { money } from "../lib/money.js";
import { useReveal } from "../hooks/useReveal.js";

function ProductCard({ product, index, onAdd }) {
  const max = stockOf(product);
  const soldOut = max < 1;
  const warehouse = Math.floor(Number(product.stock));
  const [qty, setQty] = useState(1);

  function clamp(value) {
    const next = Math.floor(Number(value));
    if (!Number.isFinite(next) || next < 1) return 1;
    return Math.min(next, Math.max(1, max));
  }

  useEffect(() => {
    setQty((prev) => clamp(prev));
    // Re-clamp when live catalog limits change (stock / max-per-order).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clamp closes over max
  }, [max]);

  function bump(delta) {
    if (soldOut) return;
    setQty((prev) => clamp(prev + delta));
  }

  return (
    <li style={{ animationDelay: index * 0.06 + "s" }}>
      {product.image ? <img src={assetUrl(product.image)} alt={product.name} /> : <span className="no-photo">Без фото</span>}
      <div>
        <h3>{product.name}</h3>
        {product.description ? <p>{product.description}</p> : null}
        <strong>{money(product.price, product.currency)}</strong>
        <span className="kind-line">{product.kind === "услуга" ? "услуга" : "товар"}</span>
        {!isUnlimitedStock(product) ? (
          <p className="note">
            {soldOut
              ? "Нет в наличии"
              : "В наличии: " + (Number.isFinite(warehouse) && warehouse >= 0 ? warehouse : max)}
          </p>
        ) : (
          <p className="note">Можно взять до {max} в одном заказе</p>
        )}
        <div className="qty-row">
          <span className="qty-label">Количество</span>
          <div className="stepper">
            <button type="button" aria-label="Меньше" disabled={soldOut || qty <= 1} onClick={() => bump(-1)}>
              −
            </button>
            <input
              className="qty"
              type="number"
              min={1}
              max={Math.max(1, max)}
              step={1}
              value={qty}
              inputMode="numeric"
              disabled={soldOut}
              onChange={(event) => setQty(clamp(event.target.value))}
              onBlur={() => setQty(clamp(qty))}
            />
            <button type="button" aria-label="Больше" disabled={soldOut || qty >= max} onClick={() => bump(1)}>
              +
            </button>
          </div>
        </div>
        <button
          className="order"
          type="button"
          disabled={soldOut}
          onClick={() => {
            if (soldOut) return;
            const next = clamp(qty);
            setQty(next);
            onAdd(product, next);
          }}
        >
          {soldOut ? "Нет в наличии" : "В корзину"}
        </button>
      </div>
    </li>
  );
}

export default function Shop() {
  const { catalog, catalogReady, catalogError, addToCart, refreshCatalog } = useCart();
  const ref = useReveal();

  let status = null;
  if (!catalogReady) status = "Загружаю витрину…";
  else if (catalogError) status = "Не получилось загрузить витрину.";
  else if (!catalog.length) status = "Пока пусто.";

  return (
    <section className="shop reveal" id="shop" ref={ref}>
      <p className="label">Магазин</p>
      <h2>Витрина</h2>
      <p className="note">Соберите заказ в корзине и решите, что оставить, уже перед отправкой.</p>
      {status ? (
        <p className="note">
          {status}
          {catalogError ? (
            <>
              {" "}
              <button type="button" className="btn ghost" onClick={() => refreshCatalog()}>
                Обновить
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      <ul className="goods">
        {catalog.map((product, index) => (
          <ProductCard key={product.id} product={product} index={index} onAdd={addToCart} />
        ))}
      </ul>
    </section>
  );
}
