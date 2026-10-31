"use strict";

const zlib = require("zlib");

/** Cap inflated ZIP entry size (docx text) to blunt compression bombs. */
const MAX_ENTRY_BYTES = 4_000_000;

/** Read one entry from a ZIP via central directory (reliable sizes). */
function readZipEntry(buffer, wantedName, maxBytes) {
  if (!buffer || buffer.length < 22) return null;
  const limit = Math.max(64_000, Number(maxBytes) || MAX_ENTRY_BYTES);

  let eocd = -1;
  const min = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let n = 0; n < entries; n += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compSize = buffer.readUInt32LE(offset + 20);
    const uncompSize = buffer.readUInt32LE(offset + 24);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLen).toString("utf8");

    if (name === wantedName) {
      if (uncompSize > limit) return null;
      if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
        return null;
      }
      const localNameLen = buffer.readUInt16LE(localOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const dataEnd = dataStart + compSize;
      if (dataEnd > buffer.length) return null;
      const chunk = buffer.slice(dataStart, dataEnd);
      if (method === 0) {
        return chunk.length > limit ? null : chunk;
      }
      if (method === 8) {
        try {
          return zlib.inflateRawSync(chunk, { maxOutputLength: limit });
        } catch {
          return null;
        }
      }
      throw new Error("zip method " + method);
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  return null;
}

module.exports = { readZipEntry, MAX_ENTRY_BYTES };
