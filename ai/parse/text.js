"use strict";

const TEXT_EXT = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".log",
  ".yml",
  ".yaml",
  ".xml",
  ".html",
  ".htm",
  ".svg",
  ".css",
  ".scss",
  ".less",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".py",
  ".rb",
  ".php",
  ".java",
  ".go",
  ".rs",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cs",
  ".sql",
  ".sh",
  ".bat",
  ".ps1",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".rtf",
  ".tex",
  ".vtt",
  ".srt"
]);

const TEXT_MIME = /^(text\/|application\/(json|xml|javascript|x-javascript|yaml|x-yaml|rtf|sql)|image\/svg\+xml)/i;

const BINARY_EXT = new Set([
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".dat",
  ".zip",
  ".rar",
  ".7z",
  ".gz",
  ".tar",
  ".bz2",
  ".xz",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".webm",
  ".wav",
  ".ogg",
  ".flac",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".psd",
  ".ai",
  ".sketch"
]);

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

function decodeBuffer(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return stripBom(buffer.toString("utf16le"));
  }
  return stripBom(buffer.toString("utf8"));
}

function printableRatio(text) {
  if (!text) return 0;
  let good = 0;
  const sample = text.slice(0, 8000);
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) good += 1;
  }
  return good / sample.length;
}

function looksLikeText(buffer, ext, type) {
  if (BINARY_EXT.has(ext)) return false;
  if (TEXT_EXT.has(ext) || TEXT_MIME.test(type)) return true;
  if (buffer.includes(0)) return false;
  return printableRatio(decodeBuffer(buffer)) >= 0.85;
}

function extractText(buffer, limit) {
  const max = limit || 16000;
  const decoded = decodeBuffer(buffer);
  if (decoded.includes("\u0000")) return "";
  if (printableRatio(decoded) < 0.7) return "";
  const cleaned = decoded.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!cleaned) return "";
  return cleaned.length > max ? cleaned.slice(0, max) + "\n…[обрезано]" : cleaned;
}

module.exports = {
  TEXT_EXT,
  BINARY_EXT,
  looksLikeText,
  extractText,
  decodeBuffer
};
