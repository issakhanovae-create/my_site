"use strict";

const { readZipEntry } = require("./zip");

function stripXml(xml) {
  return String(xml || "")
    .replace(/<w:tab[^/]*\/>/g, "\t")
    .replace(/<w:br[^/]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDocx(buffer, limit) {
  const max = limit || 16000;
  const xml = readZipEntry(buffer, "word/document.xml");
  if (!xml || !xml.length) return "";
  const text = stripXml(xml.toString("utf8"));
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "\n…[обрезано]" : text;
}

module.exports = { extractDocx };
