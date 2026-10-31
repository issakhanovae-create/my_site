"use strict";

require("./_prove_guard.cjs");

const assert = require("assert");
const { parseFile } = require("./ai/parse");
const { takeAttachment, userContent } = require("./ai/attachments");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function zipOne(name, data) {
  const n = Buffer.from(name, "utf8");
  const crc = crc32(data);
  const local = Buffer.alloc(30 + n.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(n.length, 26);
  n.copy(local, 30);
  const body = Buffer.concat([local, data]);
  const central = Buffer.alloc(46 + n.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(n.length, 28);
  central.writeUInt32LE(0, 42);
  n.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, central, eocd]);
}

let p = parseFile({ name: "note.txt", type: "text/plain", buffer: Buffer.from("Привет Эльмира\nНаграды: 6") });
assert.equal(p.kind, "text");
assert.ok(p.text.includes("Привет"));
console.log("PASS text");

p = parseFile({ name: "data.json", type: "application/json", buffer: Buffer.from(JSON.stringify({ a: 1, b: "тест" })) });
assert.equal(p.kind, "text");
console.log("PASS json");

const png = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222
]);
p = parseFile({ name: "x.bin", type: "application/octet-stream", buffer: png });
assert.equal(p.kind, "image");
assert.equal(p.mime, "image/png");
console.log("PASS image sniff");

const xml = Buffer.from(
  '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Документ про пресс-службу</w:t></w:r></w:p></w:body></w:document>'
);
const docx = zipOne("word/document.xml", xml);
p = parseFile({
  name: "letter.docx",
  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  buffer: docx
});
assert.equal(p.kind, "text", JSON.stringify(p));
assert.ok(p.text.includes("пресс-службу"), p.text);
console.log("PASS docx");

const att = takeAttachment({
  name: "note.txt",
  type: "text/plain",
  data: Buffer.from("Карьера на АРТ 2004").toString("base64")
});
assert.equal(att.kind, "text");
assert.ok(att.text.includes("АРТ"));
const uc = userContent("Что в файле?", att);
assert.ok(typeof uc === "string" && uc.includes("АРТ") && uc.includes("Что в файле?"));
console.log("PASS attach pipeline");

const imgAtt = takeAttachment({ name: "a.png", type: "image/png", data: png.toString("base64") });
const uc2 = userContent("Что на фото?", imgAtt);
assert.ok(Array.isArray(uc2) && uc2[1].type === "image_url");
console.log("PASS image userContent");

console.log("\nALL PARSE OK");
