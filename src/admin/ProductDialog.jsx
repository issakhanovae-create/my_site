import { useCallback, useEffect, useRef, useState } from "react";
import { useDialog } from "../hooks/useDialog.js";
import { api, authHeaders, clearToken } from "../lib/api.js";
import { assetUrl } from "../lib/asset.js";

const empty = {
  id: "",
  name: "",
  price: "",
  currency: "KZT",
  quantity: 10,
  stock: 10,
  kind: "товар",
  description: ""
};

export default function ProductDialog({ open, product, onClose, onSaved, onUnauthorized }) {
  const close = useCallback(() => onClose(), [onClose]);
  const dialogRef = useDialog(open, close);
  const nameRef = useRef(null);
  const fileRef = useRef(null);
  const [form, setForm] = useState(empty);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);
  const [currentImage, setCurrentImage] = useState("");

  useEffect(() => {
    if (!open) return;
    const kind = product && product.kind === "услуга" ? "услуга" : "товар";
    const stockValue =
      kind === "услуга"
        ? -1
        : product && Number.isFinite(Number(product.stock)) && Number(product.stock) >= 0
          ? Number(product.stock)
          : product
            ? Number(product.quantity) || 1
            : 1;
    setForm(
      product
        ? {
            id: product.id,
            name: product.name,
            price: product.price,
            currency: product.currency || "KZT",
            quantity: product.quantity || 1,
            stock: stockValue,
            kind,
            description: product.description || ""
          }
        : empty
    );
    setCurrentImage(product && product.image ? product.image : "");
    setNote("");
    setFile(null);
    setSaving(false);
    if (fileRef.current) fileRef.current.value = "";
    window.setTimeout(() => nameRef.current?.focus(), 0);
  }, [open, product]);

  const title = form.id
    ? form.kind === "услуга"
      ? "Изменить услугу"
      : "Изменить товар"
    : "Новая позиция";

  async function onSubmit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNote("");
    try {
      let image = "";
      if (file && file.size) {
        image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("read"));
          reader.readAsDataURL(file);
        });
      }
      const payload = {
        name: form.name,
        price: Number(form.price),
        currency: form.currency,
        quantity: Number(form.quantity),
        stock: form.kind === "услуга" ? -1 : Number(form.stock),
        kind: form.kind,
        description: form.description
      };
      if (image) payload.image = image;
      const { response, data } = await api(form.id ? "/api/products/" + form.id : "/api/products", {
        method: form.id ? "PUT" : "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });
      if (response.status === 401) {
        clearToken();
        onUnauthorized();
        return;
      }
      if (!response.ok) {
        setNote(data.error || "Не сохранилось");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setNote("Не сохранилось");
    } finally {
      setSaving(false);
    }
  }

  function setField(name, value) {
    setForm((prev) => {
      if (name === "kind") {
        if (value === "услуга") {
          return {
            ...prev,
            kind: value,
            stock: -1,
            quantity: Number(prev.quantity) < 2 ? 10 : prev.quantity
          };
        }
        return {
          ...prev,
          kind: value,
          stock: prev.stock < 0 ? Number(prev.quantity) || 10 : prev.stock
        };
      }
      return { ...prev, [name]: value };
    });
  }

  return (
    <dialog
      className="admin-window"
      ref={dialogRef}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="admin-window-bar">
        <h2>{title}</h2>
        <button className="window-close" type="button" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
      </div>
      <form className="admin-form" onSubmit={onSubmit}>
        <label>
          Название
          <input
            ref={nameRef}
            name="name"
            required
            maxLength={80}
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
          />
        </label>
        <div className="pair">
          <label>
            Цена
            <input
              name="price"
              type="number"
              min={0}
              step={1}
              required
              value={form.price}
              onChange={(event) => setField("price", event.target.value)}
            />
          </label>
          <label>
            Валюта
            <select name="currency" value={form.currency} onChange={(event) => setField("currency", event.target.value)}>
              <option value="KZT">тенге</option>
              <option value="USD">доллары</option>
              <option value="RUB">рубли</option>
            </select>
          </label>
        </div>
        <div className="pair">
          <label>
            Макс. в заказе
            <input
              name="quantity"
              type="number"
              min={1}
              max={99}
              step={1}
              required
              title="Сколько максимум можно взять одной позицией в одном заказе"
              value={form.quantity}
              onChange={(event) => setField("quantity", event.target.value)}
            />
          </label>
          <label>
            Тип
            <select name="kind" value={form.kind} onChange={(event) => setField("kind", event.target.value)}>
              <option value="товар">товар</option>
              <option value="услуга">услуга</option>
            </select>
          </label>
        </div>
        {form.kind === "товар" ? (
          <label>
            Остаток на складе
            <input
              name="stock"
              type="number"
              min={0}
              max={100000}
              step={1}
              required
              title="Сколько единиц осталось. Списывается при заказе."
              value={form.stock < 0 ? 0 : form.stock}
              onChange={(event) => setField("stock", event.target.value)}
            />
          </label>
        ) : (
          <p className="form-note">Услуга без складского остатка — лимит только «макс. в заказе».</p>
        )}
        <label>
          Описание
          <textarea
            name="description"
            rows={4}
            maxLength={400}
            value={form.description}
            onChange={(event) => setField("description", event.target.value)}
          />
        </label>
        <label>
          Фото
          {currentImage && !file ? (
            <img className="admin-preview" src={assetUrl(currentImage)} alt="" />
          ) : null}
          <input
            ref={fileRef}
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          {form.id ? <span className="form-note">Новый файл заменит текущее фото. Можно не менять.</span> : null}
        </label>
        <button className="btn gold" type="submit" disabled={saving}>
          Сохранить
        </button>
        <p className="form-note">{note}</p>
      </form>
    </dialog>
  );
}
