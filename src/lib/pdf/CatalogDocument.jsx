import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { money } from "../money.js";
import notoRegular from "../../assets/fonts/NotoSans-Regular.ttf";
import notoBold from "../../assets/fonts/NotoSans-Bold.ttf";

Font.register({
  family: "NotoSans",
  fonts: [
    { src: notoRegular, fontWeight: 400 },
    { src: notoBold, fontWeight: 700 }
  ]
});

// Без переносов по слогам — для кириллицы безопаснее, чем дефолтный латиница-хендлер.
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
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d4c4a8"
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 4
  },
  date: {
    fontSize: 9,
    color: "#5c5346"
  },
  empty: {
    marginTop: 40,
    textAlign: "center",
    fontSize: 12,
    color: "#5c5346"
  },
  card: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee6d8"
  },
  photo: {
    width: 72,
    height: 72,
    objectFit: "cover"
  },
  noPhoto: {
    width: 72,
    height: 72,
    backgroundColor: "#f3eee4",
    alignItems: "center",
    justifyContent: "center"
  },
  noPhotoText: {
    fontSize: 8,
    color: "#8a8070"
  },
  body: {
    flex: 1,
    minWidth: 0
  },
  name: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 2
  },
  kind: {
    fontSize: 9,
    color: "#5c5346",
    marginBottom: 2,
    textTransform: "lowercase"
  },
  price: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 2
  },
  meta: {
    fontSize: 9,
    color: "#5c5346",
    marginBottom: 2
  },
  description: {
    fontSize: 9,
    marginTop: 2,
    lineHeight: 1.35
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

function stockLabel(product) {
  if (product.kind === "услуга" || Number(product.stock) < 0) return "остаток: без лимита";
  if (Number(product.stock) === 0) return "остаток: нет";
  return "остаток: " + product.stock;
}

function kindLabel(product) {
  return product.kind === "услуга" ? "услуга" : "товар";
}

function exportDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function ProductBlock({ product }) {
  // image уже подготовлен в prepareCatalogProducts (png/jpeg data-URL или "").
  const src = typeof product.image === "string" && product.image.startsWith("data:image/")
    ? product.image
    : "";
  const description = String(product.description || "").trim();

  return (
    <View style={styles.card} wrap={false}>
      {src ? (
        <Image style={styles.photo} src={src} cache={false} />
      ) : (
        <View style={styles.noPhoto}>
          <Text style={styles.noPhotoText}>Без фото</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name}>{product.name || "Без названия"}</Text>
        <Text style={styles.kind}>{kindLabel(product)}</Text>
        <Text style={styles.price}>{money(product.price, product.currency)}</Text>
        <Text style={styles.meta}>
          {stockLabel(product)}
          {" · макс. в заказе: "}
          {product.quantity || 1}
        </Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
    </View>
  );
}

export default function CatalogDocument({ products = [], exportedAt = new Date() }) {
  const list = Array.isArray(products) ? products : [];

  return (
    <Document title="Каталог товаров и услуг">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Каталог товаров и услуг</Text>
          <Text style={styles.date}>Дата выгрузки: {exportDateLabel(exportedAt)}</Text>
        </View>

        {list.length === 0 ? (
          <Text style={styles.empty}>Пока нет товаров</Text>
        ) : (
          list.map((product, index) => (
            <ProductBlock key={product.id || product.name || index} product={product} />
          ))
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => pageNumber + " / " + totalPages}
          fixed
        />
      </Page>
    </Document>
  );
}
