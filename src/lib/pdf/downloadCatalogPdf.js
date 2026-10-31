import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import CatalogDocument from "./CatalogDocument.jsx";
import { prepareCatalogProducts } from "./prepareCatalogImages.js";

function fileStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Не revok'ать сразу: в части браузеров скачивание ещё не стартовало.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadCatalogPdf(products) {
  const exportedAt = new Date();
  const prepared = await prepareCatalogProducts(products);
  const blob = await pdf(
    createElement(CatalogDocument, { products: prepared, exportedAt })
  ).toBlob();
  if (!blob || blob.size < 100) {
    throw new Error("empty-pdf");
  }
  saveBlob(blob, "catalog-" + fileStamp(exportedAt) + ".pdf");
}
