import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import InvoiceDocument from "./InvoiceDocument.jsx";

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadInvoicePdf(order) {
  if (!order || order.id == null) {
    throw new Error("no-order");
  }
  const blob = await pdf(createElement(InvoiceDocument, { order })).toBlob();
  if (!blob || blob.size < 100) {
    throw new Error("empty-pdf");
  }
  saveBlob(blob, "invoice-" + order.id + ".pdf");
}
