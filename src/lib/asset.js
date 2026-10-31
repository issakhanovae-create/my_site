/** Normalize API image paths like `img/shop/…` for the SPA. */
export function assetUrl(src) {
  if (!src) return "";
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  return src.startsWith("/") ? src : "/" + src;
}
