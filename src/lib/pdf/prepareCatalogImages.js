import { assetUrl } from "../asset.js";

function absoluteUrl(path) {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin + path;
  }
  return path;
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

/** @react-pdf понимает png/jpeg/svg; webp из админки нужно перегнать в png. */
async function toPdfImageDataUrl(src) {
  try {
    const response = await fetch(src, { cache: "force-cache" });
    if (!response.ok) return "";
    const blob = await response.blob();
    const type = String(blob.type || "").toLowerCase();

    if (type === "image/png" || type === "image/jpeg" || type === "image/jpg") {
      return blobToDataUrl(blob);
    }

    if (typeof createImageBitmap !== "function") return "";

    const bitmap = await createImageBitmap(blob);
    const maxSide = 240;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height, 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return "";
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/** Готовит копию каталога: image → data-URL для PDF или "" если фото нет/битое. */
export async function prepareCatalogProducts(products) {
  const list = Array.isArray(products) ? products : [];
  return Promise.all(
    list.map(async (product) => {
      const path = product?.image ? assetUrl(product.image) : "";
      const photo = path ? await toPdfImageDataUrl(absoluteUrl(path)) : "";
      return { ...product, image: photo };
    })
  );
}
