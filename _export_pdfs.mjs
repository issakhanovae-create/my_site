/**
 * One-shot Node export of catalog + invoice PDFs (no Vite, no browser).
 * Writes into ./exports/
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createElement as h } from "react";
import ReactPDF, { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const outDir = path.join(root, "exports");
fs.mkdirSync(outDir, { recursive: true });

const marks = { KZT: "₸", RUB: "₽", USD: "$" };
function money(value, currency) {
  const code = marks[currency] ? currency : "KZT";
  const amount = new Intl.NumberFormat("ru-RU").format(value);
  return code === "USD" ? "$" + amount : amount + " " + marks[code];
}

Font.register({
  family: "NotoSans",
  fonts: [
    { src: path.join(root, "src/assets/fonts/NotoSans-Regular.ttf"), fontWeight: 400 },
    { src: path.join(root, "src/assets/fonts/NotoSans-Bold.ttf"), fontWeight: 700 }
  ]
});
Font.registerHyphenationCallback((word) => [word]);

const company = {
  name: "ЗАМЕНИТЬ: название ИП/ТОО",
  requisites: "ЗАМЕНИТЬ: БИН/ИНН, адрес",
  phone: "ЗАМЕНИТЬ: контактный телефон",
  bank: "ЗАМЕНИТЬ: банковские реквизиты (если нужно для счёта)"
};

const statusNames = {
  new: "Новый",
  work: "В работе",
  done: "Готово",
  cancel: "Отменён"
};

function dateLabel(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function stockLabel(product) {
  if (product.kind === "услуга" || Number(product.stock) < 0) return "остаток: без лимита";
  if (Number(product.stock) === 0) return "остаток: нет";
  return "остаток: " + product.stock;
}

function kindLabel(product) {
  return product.kind === "услуга" ? "услуга" : "товар";
}

function toDataUrl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" :
    ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
    "";
  if (!mime) return "";
  return "data:" + mime + ";base64," + fs.readFileSync(filePath).toString("base64");
}

const catalogStyles = StyleSheet.create({
  page: {
    fontFamily: "NotoSans",
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 40,
    color: "#1c1408"
  },
  header: {
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d4c4a8"
  },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  date: { fontSize: 9, color: "#5c5346" },
  empty: { marginTop: 40, textAlign: "center", fontSize: 12, color: "#5c5346" },
  card: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee6d8"
  },
  photo: { width: 72, height: 72, objectFit: "cover" },
  noPhoto: {
    width: 72,
    height: 72,
    backgroundColor: "#f3eee4",
    alignItems: "center",
    justifyContent: "center"
  },
  noPhotoText: { fontSize: 8, color: "#8a8070" },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 12, fontWeight: 700, marginBottom: 2 },
  kind: { fontSize: 9, color: "#5c5346", marginBottom: 2, textTransform: "lowercase" },
  price: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  meta: { fontSize: 9, color: "#5c5346", marginBottom: 2 },
  description: { fontSize: 9, marginTop: 2, lineHeight: 1.35 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#8a8070",
    textAlign: "center"
  }
});

function CatalogDocument({ products, exportedAt }) {
  return h(Document, { title: "Каталог товаров и услуг" },
    h(Page, { size: "A4", style: catalogStyles.page },
      h(View, { style: catalogStyles.header },
        h(Text, { style: catalogStyles.title }, "Каталог товаров и услуг"),
        h(Text, { style: catalogStyles.date }, "Дата выгрузки: " + dateLabel(exportedAt))
      ),
      products.length === 0
        ? h(Text, { style: catalogStyles.empty }, "Пока нет товаров")
        : products.map((product, index) => {
            const src = product.imageData || "";
            const description = String(product.description || "").trim();
            return h(View, {
              key: product.id || product.name || index,
              style: catalogStyles.card,
              wrap: false
            },
              src
                ? h(Image, { style: catalogStyles.photo, src, cache: false })
                : h(View, { style: catalogStyles.noPhoto },
                    h(Text, { style: catalogStyles.noPhotoText }, "Без фото")
                  ),
              h(View, { style: catalogStyles.body },
                h(Text, { style: catalogStyles.name }, product.name || "Без названия"),
                h(Text, { style: catalogStyles.kind }, kindLabel(product)),
                h(Text, { style: catalogStyles.price }, money(product.price, product.currency)),
                h(Text, { style: catalogStyles.meta },
                  stockLabel(product) + " · макс. в заказе: " + (product.quantity || 1)
                ),
                description ? h(Text, { style: catalogStyles.description }, description) : null
              )
            );
          }),
      h(Text, {
        style: catalogStyles.footer,
        render: ({ pageNumber, totalPages }) => pageNumber + " / " + totalPages,
        fixed: true
      })
    )
  );
}

const invoiceStyles = StyleSheet.create({
  page: {
    fontFamily: "NotoSans",
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 40,
    color: "#1c1408"
  },
  header: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d4c4a8"
  },
  seller: { flex: 1, minWidth: 0 },
  sellerName: { fontSize: 12, fontWeight: 700, marginBottom: 4 },
  sellerLine: { fontSize: 9, color: "#5c5346", marginBottom: 2, lineHeight: 1.35 },
  docMeta: { width: 180, alignItems: "flex-end" },
  docTitle: { fontSize: 13, fontWeight: 700, textAlign: "right", marginBottom: 4 },
  docDate: { fontSize: 9, color: "#5c5346", textAlign: "right" },
  section: { marginBottom: 14 },
  sectionLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: "#5c5346",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  recipientName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  recipientPhone: { fontSize: 10 },
  table: { marginBottom: 12, borderWidth: 1, borderColor: "#d4c4a8" },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee6d8",
    alignItems: "flex-start"
  },
  rowLast: { borderBottomWidth: 0 },
  headCell: {
    fontSize: 8,
    fontWeight: 700,
    color: "#5c5346",
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: "#f3eee4"
  },
  cell: { fontSize: 9, paddingVertical: 6, paddingHorizontal: 6, lineHeight: 1.3 },
  colNum: { width: 28 },
  colName: { flex: 1, minWidth: 0 },
  colQty: { width: 44, textAlign: "right" },
  colPrice: { width: 78, textAlign: "right" },
  colSum: { width: 84, textAlign: "right" },
  totals: { marginBottom: 12, alignItems: "flex-end" },
  totalLine: { fontSize: 11, fontWeight: 700, marginBottom: 3 },
  comment: { fontSize: 9, lineHeight: 1.35, marginBottom: 10 },
  status: { fontSize: 10 },
  emptyItems: { fontSize: 10, color: "#5c5346", marginBottom: 12 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#8a8070",
    textAlign: "center"
  }
});

function phoneLabel(phone) {
  const digits = String(phone || "").trim();
  if (!digits) return "";
  return digits.startsWith("+") ? digits : "+" + digits;
}

function lineSum(line) {
  const qty = Number(line.qty);
  const price = Number(line.price);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return qty * price;
}

function InvoiceDocument({ order }) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const totals = Array.isArray(order?.totals) ? order.totals : [];
  const comment = String(order?.comment || "").trim();
  const statusLabel = statusNames[order?.status] || order?.status || "—";
  const id = order?.id ?? "—";

  return h(Document, { title: "Счёт-фактура №" + id },
    h(Page, { size: "A4", style: invoiceStyles.page },
      h(View, { style: invoiceStyles.header },
        h(View, { style: invoiceStyles.seller },
          h(Text, { style: invoiceStyles.sellerName }, company.name),
          company.requisites ? h(Text, { style: invoiceStyles.sellerLine }, company.requisites) : null,
          company.phone ? h(Text, { style: invoiceStyles.sellerLine }, company.phone) : null,
          company.bank ? h(Text, { style: invoiceStyles.sellerLine }, company.bank) : null
        ),
        h(View, { style: invoiceStyles.docMeta },
          h(Text, { style: invoiceStyles.docTitle }, "Счёт-фактура №" + id),
          h(Text, { style: invoiceStyles.docDate }, "от " + dateLabel(order?.createdAt))
        )
      ),
      h(View, { style: invoiceStyles.section },
        h(Text, { style: invoiceStyles.sectionLabel }, "Получатель"),
        h(Text, { style: invoiceStyles.recipientName }, order?.name || "—"),
        h(Text, { style: invoiceStyles.recipientPhone }, phoneLabel(order?.phone))
      ),
      items.length === 0
        ? h(Text, { style: invoiceStyles.emptyItems }, "Нет позиций в заказе")
        : h(View, { style: invoiceStyles.table },
            h(View, { style: invoiceStyles.row },
              h(Text, { style: [invoiceStyles.headCell, invoiceStyles.colNum] }, "№"),
              h(Text, { style: [invoiceStyles.headCell, invoiceStyles.colName] }, "Наименование"),
              h(Text, { style: [invoiceStyles.headCell, invoiceStyles.colQty] }, "Кол-во"),
              h(Text, { style: [invoiceStyles.headCell, invoiceStyles.colPrice] }, "Цена"),
              h(Text, { style: [invoiceStyles.headCell, invoiceStyles.colSum] }, "Сумма")
            ),
            ...items.map((line, index) =>
              h(View, {
                key: (line.id || line.name || "line") + "-" + index,
                style: index === items.length - 1
                  ? [invoiceStyles.row, invoiceStyles.rowLast]
                  : invoiceStyles.row,
                wrap: false
              },
                h(Text, { style: [invoiceStyles.cell, invoiceStyles.colNum] }, String(index + 1)),
                h(Text, { style: [invoiceStyles.cell, invoiceStyles.colName] }, line.name || "—"),
                h(Text, { style: [invoiceStyles.cell, invoiceStyles.colQty] }, String(line.qty)),
                h(Text, { style: [invoiceStyles.cell, invoiceStyles.colPrice] }, money(line.price, line.currency)),
                h(Text, { style: [invoiceStyles.cell, invoiceStyles.colSum] }, money(lineSum(line), line.currency))
              )
            )
          ),
      totals.length
        ? h(View, { style: invoiceStyles.totals },
            ...totals.map((line, index) =>
              h(Text, {
                key: (line.currency || "cur") + "-" + index,
                style: invoiceStyles.totalLine
              }, "Итого (" + (line.currency || "—") + "): " + money(line.sum, line.currency))
            )
          )
        : null,
      comment
        ? h(View, { style: invoiceStyles.section },
            h(Text, { style: invoiceStyles.sectionLabel }, "Комментарий"),
            h(Text, { style: invoiceStyles.comment }, comment)
          )
        : null,
      h(Text, { style: invoiceStyles.status }, "Статус заказа: " + statusLabel),
      h(Text, {
        style: invoiceStyles.footer,
        render: ({ pageNumber, totalPages }) => pageNumber + " / " + totalPages,
        fixed: true
      })
    )
  );
}

function parseJsonList(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const products = JSON.parse(fs.readFileSync(path.join(root, "data/products.json"), "utf8"));
const prepared = products.map((product) => {
  const rel = String(product.image || "").replace(/^\/+/, "");
  const abs = rel ? path.join(root, rel) : "";
  return { ...product, imageData: toDataUrl(abs) };
});

const db = new DatabaseSync(path.join(root, "data/crm.db"));
const row = db.prepare(
  "SELECT id, created_at, status, name, phone, comment, items, totals FROM orders WHERE id = 501"
).get();
const order = {
  id: row.id,
  createdAt: row.created_at,
  status: row.status,
  name: row.name,
  phone: row.phone,
  comment: row.comment,
  items: parseJsonList(row.items),
  totals: parseJsonList(row.totals)
};

const stamp = new Date();
const catalogName = "catalog-" + stamp.toISOString().slice(0, 10) + ".pdf";
const invoiceName = "invoice-" + order.id + ".pdf";

await ReactPDF.renderToFile(
  h(CatalogDocument, { products: prepared, exportedAt: stamp }),
  path.join(outDir, catalogName)
);
await ReactPDF.renderToFile(
  h(InvoiceDocument, { order }),
  path.join(outDir, invoiceName)
);

console.log("OK");
console.log(path.join(outDir, catalogName));
console.log(path.join(outDir, invoiceName));
