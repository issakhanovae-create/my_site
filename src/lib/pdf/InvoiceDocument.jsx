import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import { money } from "../money.js";
import { company } from "../../data/company.js";
import { statusNames } from "../../admin/status.js";
import notoRegular from "../../assets/fonts/NotoSans-Regular.ttf";
import notoBold from "../../assets/fonts/NotoSans-Bold.ttf";

Font.register({
  family: "NotoSans",
  fonts: [
    { src: notoRegular, fontWeight: 400 },
    { src: notoBold, fontWeight: 700 }
  ]
});

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
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
  seller: {
    flex: 1,
    minWidth: 0
  },
  sellerName: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 4
  },
  sellerLine: {
    fontSize: 9,
    color: "#5c5346",
    marginBottom: 2,
    lineHeight: 1.35
  },
  docMeta: {
    width: 180,
    alignItems: "flex-end"
  },
  docTitle: {
    fontSize: 13,
    fontWeight: 700,
    textAlign: "right",
    marginBottom: 4
  },
  docDate: {
    fontSize: 9,
    color: "#5c5346",
    textAlign: "right"
  },
  section: {
    marginBottom: 14
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: "#5c5346",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  recipientName: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 2
  },
  recipientPhone: {
    fontSize: 10
  },
  table: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#d4c4a8"
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee6d8",
    alignItems: "flex-start"
  },
  rowLast: {
    borderBottomWidth: 0
  },
  headCell: {
    fontSize: 8,
    fontWeight: 700,
    color: "#5c5346",
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: "#f3eee4"
  },
  cell: {
    fontSize: 9,
    paddingVertical: 6,
    paddingHorizontal: 6,
    lineHeight: 1.3
  },
  colNum: { width: 28 },
  colName: { flex: 1, minWidth: 0 },
  colQty: { width: 44, textAlign: "right" },
  colPrice: { width: 78, textAlign: "right" },
  colSum: { width: 84, textAlign: "right" },
  totals: {
    marginBottom: 12,
    alignItems: "flex-end"
  },
  totalLine: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 3
  },
  comment: {
    fontSize: 9,
    lineHeight: 1.35,
    marginBottom: 10
  },
  status: {
    fontSize: 10
  },
  emptyItems: {
    fontSize: 10,
    color: "#5c5346",
    marginBottom: 12
  },
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

function invoiceDateLabel(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

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

function TableHead() {
  return (
    <View style={styles.row}>
      <Text style={[styles.headCell, styles.colNum]}>№</Text>
      <Text style={[styles.headCell, styles.colName]}>Наименование</Text>
      <Text style={[styles.headCell, styles.colQty]}>Кол-во</Text>
      <Text style={[styles.headCell, styles.colPrice]}>Цена</Text>
      <Text style={[styles.headCell, styles.colSum]}>Сумма</Text>
    </View>
  );
}

function TableRow({ index, line, isLast }) {
  return (
    <View style={isLast ? [styles.row, styles.rowLast] : styles.row} wrap={false}>
      <Text style={[styles.cell, styles.colNum]}>{index}</Text>
      <Text style={[styles.cell, styles.colName]}>{line.name || "—"}</Text>
      <Text style={[styles.cell, styles.colQty]}>{line.qty}</Text>
      <Text style={[styles.cell, styles.colPrice]}>{money(line.price, line.currency)}</Text>
      <Text style={[styles.cell, styles.colSum]}>{money(lineSum(line), line.currency)}</Text>
    </View>
  );
}

export default function InvoiceDocument({ order }) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const totals = Array.isArray(order?.totals) ? order.totals : [];
  const comment = String(order?.comment || "").trim();
  const statusLabel = statusNames[order?.status] || order?.status || "—";
  const id = order?.id ?? "—";

  return (
    <Document title={"Счёт-фактура №" + id}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.seller}>
            <Text style={styles.sellerName}>{company.name}</Text>
            {company.requisites ? <Text style={styles.sellerLine}>{company.requisites}</Text> : null}
            {company.phone ? <Text style={styles.sellerLine}>{company.phone}</Text> : null}
            {company.bank ? <Text style={styles.sellerLine}>{company.bank}</Text> : null}
          </View>
          <View style={styles.docMeta}>
            <Text style={styles.docTitle}>Счёт-фактура №{id}</Text>
            <Text style={styles.docDate}>от {invoiceDateLabel(order?.createdAt)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Получатель</Text>
          <Text style={styles.recipientName}>{order?.name || "—"}</Text>
          <Text style={styles.recipientPhone}>{phoneLabel(order?.phone)}</Text>
        </View>

        {items.length === 0 ? (
          <Text style={styles.emptyItems}>Нет позиций в заказе</Text>
        ) : (
          <View style={styles.table}>
            <TableHead />
            {items.map((line, index) => (
              <TableRow
                key={(line.id || line.name || "line") + "-" + index}
                index={index + 1}
                line={line}
                isLast={index === items.length - 1}
              />
            ))}
          </View>
        )}

        {totals.length ? (
          <View style={styles.totals}>
            {totals.map((line, index) => (
              <Text key={(line.currency || "cur") + "-" + index} style={styles.totalLine}>
                Итого ({line.currency || "—"}): {money(line.sum, line.currency)}
              </Text>
            ))}
          </View>
        ) : null}

        {comment ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Комментарий</Text>
            <Text style={styles.comment}>{comment}</Text>
          </View>
        ) : null}

        <Text style={styles.status}>Статус заказа: {statusLabel}</Text>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => pageNumber + " / " + totalPages}
          fixed
        />
      </Page>
    </Document>
  );
}
