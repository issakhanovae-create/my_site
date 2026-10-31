"use strict";

const zlib = require("zlib");

/** Cap inflated PDF stream size to blunt compression bombs. */
const MAX_STREAM_BYTES = 4_000_000;

function decodePdfString(raw) {
  return String(raw || "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function extractFromContent(content) {
  const parts = [];
  const re = /\((?:\\.|[^\\)])*\)\s*Tj|\[(?:\s*\((?:\\.|[^\\)])*\)\s*-?\d*\.?\d*)+\]\s*TJ/g;
  let match;
  while ((match = re.exec(content))) {
    const token = match[0];
    if (token.endsWith("Tj")) {
      const inner = token.slice(1, token.lastIndexOf(")"));
      parts.push(decodePdfString(inner));
    } else {
      const bits = [];
      const piece = /\((?:\\.|[^\\)])*\)/g;
      let pieceMatch;
      while ((pieceMatch = piece.exec(token))) {
        bits.push(decodePdfString(pieceMatch[0].slice(1, -1)));
      }
      parts.push(bits.join(""));
    }
  }
  return parts.join(" ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function inflateMaybe(data, maxOutputLength) {
  const opts = { maxOutputLength: maxOutputLength || MAX_STREAM_BYTES };
  try {
    return zlib.inflateSync(data, opts);
  } catch {}
  try {
    return zlib.unzipSync(data, opts);
  } catch {}
  try {
    return zlib.inflateRawSync(data, opts);
  } catch {}
  return null;
}

function extractPdf(buffer, limit) {
  const max = limit || 16000;
  const latin = buffer.toString("latin1");
  const chunks = [];
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let match;
  let inflatedBudget = MAX_STREAM_BYTES;
  while ((match = streamRe.exec(latin))) {
    let payload = Buffer.from(match[1], "latin1");
    if (payload[0] === 0x0d && payload[1] === 0x0a) payload = payload.slice(2);
    else if (payload[0] === 0x0a || payload[0] === 0x0d) payload = payload.slice(1);
    if (payload[payload.length - 1] === 0x0a) payload = payload.slice(0, -1);
    if (payload[payload.length - 1] === 0x0d) payload = payload.slice(0, -1);

    let content = payload.toString("latin1");
    if (inflatedBudget > 0) {
      const inflated = inflateMaybe(payload, inflatedBudget);
      if (inflated) {
        inflatedBudget -= inflated.length;
        content = inflated.toString("latin1");
      }
    }
    const text = extractFromContent(content);
    if (text) chunks.push(text);
  }

  if (!chunks.length) {
    const plain = extractFromContent(latin);
    if (plain) chunks.push(plain);
  }

  const joined = chunks.join("\n").replace(/\u0000/g, "").trim();
  if (!joined) return "";
  return joined.length > max ? joined.slice(0, max) + "\n…[обрезано]" : joined;
}

module.exports = { extractPdf, MAX_STREAM_BYTES };
