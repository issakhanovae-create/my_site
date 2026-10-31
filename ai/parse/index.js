"use strict";

const path = require("path");
const { extractText, looksLikeText } = require("./text");
const { extractPdf } = require("./pdf");
const { extractDocx } = require("./docx");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const IMAGE_MIME = /^image\/(jpeg|png|webp|gif)$/i;

function sniffImageMime(buffer, ext, type) {
  if (IMAGE_MIME.test(type)) return type.toLowerCase();
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer.length >= 6) {
    const head = buffer.slice(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  if (buffer.length >= 12 && buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "";
}

/**
 * Parse an uploaded file for the AI consult pipeline.
 * @returns {{ kind: 'image'|'text'|'binary', text: string, mime: string, note: string }}
 */
function parseFile({ name, type, buffer }) {
  const fileName = String(name || "файл");
  const mimeIn = String(type || "application/octet-stream").toLowerCase();
  const ext = path.extname(fileName).toLowerCase();
  const bytes = buffer && buffer.length ? buffer.length : 0;

  if (!buffer || !bytes) {
    return { kind: "binary", text: "", mime: mimeIn, note: "пустой файл" };
  }

  const imageMime = sniffImageMime(buffer, ext, mimeIn);
  if (imageMime || IMAGE_EXT.has(ext) || IMAGE_MIME.test(mimeIn)) {
    return {
      kind: "image",
      text: "",
      mime: imageMime || mimeIn || "image/jpeg",
      note: "изображение"
    };
  }

  if (ext === ".pdf" || mimeIn === "application/pdf") {
    try {
      const text = extractPdf(buffer);
      if (text) return { kind: "text", text, mime: "application/pdf", note: "pdf" };
    } catch (error) {
      return { kind: "binary", text: "", mime: "application/pdf", note: "pdf: " + (error.message || "parse fail") };
    }
    return { kind: "binary", text: "", mime: "application/pdf", note: "pdf без извлекаемого текста" };
  }

  if (
    ext === ".docx" ||
    mimeIn === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const text = extractDocx(buffer);
      if (text) return { kind: "text", text, mime: mimeIn || "application/vnd.openxmlformats-officedocument.wordprocessingml.document", note: "docx" };
    } catch (error) {
      return { kind: "binary", text: "", mime: mimeIn, note: "docx: " + (error.message || "parse fail") };
    }
    return { kind: "binary", text: "", mime: mimeIn, note: "docx без текста" };
  }

  if (looksLikeText(buffer, ext, mimeIn)) {
    const text = extractText(buffer);
    if (text) return { kind: "text", text, mime: mimeIn.startsWith("text/") ? mimeIn : "text/plain", note: "text" };
  }

  return {
    kind: "binary",
    text: "",
    mime: mimeIn || "application/octet-stream",
    note: "бинарный файл"
  };
}

module.exports = { parseFile };
