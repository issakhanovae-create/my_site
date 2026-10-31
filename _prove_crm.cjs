"use strict";

require("./_prove_guard.cjs");

const fs = require("fs");
const path = require("path");
const http = require("http");
const assert = require("assert");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

function loadEnv(file) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(path.join(__dirname, ".env"));
const host = "127.0.0.1";
const port = Number(process.env.PORT) || 8765;
const password = process.env.ADMIN_PASSWORD;
const phoneA = "77007771111";
const phoneB = "77008882222";
const phoneC = "77006663333";

let passed = 0;
let failed = 0;
const results = [];
let token = "";

function ok(name) {
  passed += 1;
  results.push("PASS  " + name);
}

function fail(name, err) {
  failed += 1;
  results.push("FAIL  " + name + " — " + (err && err.message ? err.message : err));
}

function request(method, pathName, body, auth) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), "utf8");
    const headers = payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {};
    if (auth) headers.Authorization = "Bearer " + auth;
    const req = http.request({ host, port, path: pathName, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function check(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

function sourceHas(needle) {
  return fs.readFileSync(path.join(__dirname, "server.cjs"), "utf8").includes(needle);
}

function listPayload(json) {
  if (Array.isArray(json)) return json;
  return Array.isArray(json && json.items) ? json.items : [];
}

(async () => {
  await check("исходник: BEGIN IMMEDIATE, order_keys, busy_timeout", async () => {
    const src = fs.readFileSync(path.join(__dirname, "server.cjs"), "utf8");
    assert.ok(src.includes("BEGIN IMMEDIATE"));
    assert.ok(!/\.transaction\s*\(/.test(src));
    assert.ok(src.includes("busy_timeout"));
    assert.ok(src.includes("CREATE TABLE IF NOT EXISTS order_keys"));
    assert.ok(src.includes("lookupOrderKey") || src.includes("getOrderKey"));
  });

  await check("auth: GET /api/clients без токена → 401", async () => {
    const res = await request("GET", "/api/clients");
    assert.equal(res.status, 401);
  });

  await check("login → token", async () => {
    const res = await request("POST", "/api/login", { password });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    token = res.json.token;
    assert.ok(token);
  });

  const products = (await request("GET", "/api/products")).json;
  assert.ok(Array.isArray(products) && products.length, "витрина пуста");
  const product = products.find((p) => Number(p.quantity) >= 1) || products[0];
  const limited = products.find((p) => Number(p.quantity) === 1) || product;

  await check("qty > stock → 400", async () => {
    const max = Math.min(99, Math.max(1, Math.floor(Number(limited.quantity)) || 1));
    const res = await request("POST", "/api/orders", {
      name: "CRM Proof",
      phone: phoneA,
      items: [{ id: limited.id, qty: max + 1 }],
      idempotencyKey: "crmqty" + crypto.randomBytes(4).toString("hex")
    });
    assert.equal(res.status, 400);
  });

  let order1 = 0;
  let order2 = 0;
  await check("создать заказ A → 201", async () => {
    const res = await request("POST", "/api/orders", {
      name: "Клиент А",
      phone: phoneA,
      items: [{ id: product.id, qty: 1 }],
      idempotencyKey: "crmo1" + crypto.randomBytes(4).toString("hex")
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    order1 = res.json.id;
  });

  await check("пометить клиента done + note", async () => {
    const res = await request("PATCH", "/api/clients/" + phoneA, { status: "done", note: "keep-me" }, token);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.status, "done");
    assert.equal(res.json.note, "keep-me");
  });

  await check("скрыть клиента", async () => {
    const res = await request("PATCH", "/api/clients/" + phoneA, { hidden: true }, token);
    assert.equal(res.status, 200);
    assert.equal(res.json.hidden, true);
  });

  await check("повторный заказ: статус done, note на месте, unhide", async () => {
    const res = await request("POST", "/api/orders", {
      name: "Клиент А",
      phone: phoneA,
      items: [{ id: product.id, qty: 1 }],
      idempotencyKey: "crmo2" + crypto.randomBytes(4).toString("hex")
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    order2 = res.json.id;
    const clients = await request("GET", "/api/clients?limit=100", null, token);
    const row = listPayload(clients.json).find((c) => c.phone === phoneA);
    assert.ok(row);
    assert.equal(row.status, "done");
    assert.equal(row.note, "keep-me");
    assert.equal(row.hidden, false);
  });

  await check("PATCH старого заказа не меняет клиента", async () => {
    const res = await request("PATCH", "/api/orders/" + order1, { status: "cancel" }, token);
    assert.equal(res.status, 200);
    const clients = await request("GET", "/api/clients?limit=100", null, token);
    const row = listPayload(clients.json).find((c) => c.phone === phoneA);
    assert.equal(row.status, "done");
  });

  await check("PATCH последнего заказа синхронизирует клиента", async () => {
    const res = await request("PATCH", "/api/orders/" + order2, { status: "work" }, token);
    assert.equal(res.status, 200);
    const clients = await request("GET", "/api/clients?limit=100", null, token);
    const row = listPayload(clients.json).find((c) => c.phone === phoneA);
    assert.equal(row.status, "work");
  });

  await check("чужой клиент B не задет", async () => {
    const create = await request("POST", "/api/orders", {
      name: "Клиент Б",
      phone: phoneB,
      items: [{ id: product.id, qty: 1 }],
      idempotencyKey: "crmob" + crypto.randomBytes(4).toString("hex")
    });
    assert.equal(create.status, 201);
    await request("PATCH", "/api/clients/" + phoneB, { status: "done", note: "b-note" }, token);
    const clients = await request("GET", "/api/clients?limit=100", null, token);
    const rows = listPayload(clients.json);
    const a = rows.find((c) => c.phone === phoneA);
    const b = rows.find((c) => c.phone === phoneB);
    assert.equal(a.status, "work");
    assert.equal(b.status, "done");
    assert.equal(b.note, "b-note");
  });

  await check("DELETE последнего → пересчёт статуса", async () => {
    const del = await request("DELETE", "/api/orders/" + order2, null, token);
    assert.equal(del.status, 200);
    const clients = await request("GET", "/api/clients?limit=100", null, token);
    const row = listPayload(clients.json).find((c) => c.phone === phoneA);
    assert.equal(row.status, "cancel");
  });

  await check("DELETE последнего заказа не сбрасывает ручной статус в new", async () => {
    // Свежий телефон: один заказ → вручную done → удалить → статус остаётся done (не new)
    const fresh = "7700" + String(Date.now()).slice(-7);
    const create = await request("POST", "/api/orders", {
      name: "Клиент С",
      phone: fresh,
      items: [{ id: product.id, qty: 1 }],
      idempotencyKey: "crmodel" + crypto.randomBytes(4).toString("hex")
    });
    assert.equal(create.status, 201, JSON.stringify(create.json));
    const patch = await request("PATCH", "/api/clients/" + fresh, { status: "done", note: "keep-after-delete" }, token);
    assert.equal(patch.status, 200);
    assert.equal(patch.json.status, "done");
    const del = await request("DELETE", "/api/orders/" + create.json.id, null, token);
    assert.equal(del.status, 200);
    const clients = await request("GET", "/api/clients?limit=200", null, token);
    const row = listPayload(clients.json).find((c) => c.phone === fresh);
    assert.ok(row);
    assert.equal(row.status, "done");
    assert.equal(row.note, "keep-after-delete");
  });

  await check("пагинация заказов: items + total", async () => {
    const res = await request("GET", "/api/orders?limit=2&offset=0", null, token);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json.items));
    assert.ok(res.json.items.length <= 2);
    assert.ok(Number(res.json.total) >= res.json.items.length);
  });

  await check("пагинация заказов: before (keyset)", async () => {
    const first = await request("GET", "/api/orders?limit=2", null, token);
    assert.equal(first.status, 200);
    assert.ok(first.json.items.length >= 1);
    const cursor = first.json.items[first.json.items.length - 1].id;
    const second = await request("GET", "/api/orders?limit=2&before=" + cursor, null, token);
    assert.equal(second.status, 200);
    for (const row of second.json.items) {
      assert.ok(row.id < cursor, "keyset must go older than cursor");
    }
    const overlap = second.json.items.some((row) => first.json.items.some((a) => a.id === row.id));
    assert.equal(overlap, false);
  });

  await check("битый JSON items не роняет GET /api/orders", async () => {
    const dbPath = path.join(__dirname, "data", "crm.db");
    let db;
    let orderId = 0;
    let originalItems = null;
    try {
      db = new DatabaseSync(dbPath);
      db.exec("PRAGMA busy_timeout = 5000;");
      const row = db.prepare("SELECT id, items FROM orders WHERE phone = ? ORDER BY id DESC LIMIT 1").get(phoneB);
      assert.ok(row);
      orderId = row.id;
      originalItems = row.items;
      db.prepare("UPDATE orders SET items = ? WHERE id = ?").run("{not-json", orderId);

      const res = await request("GET", "/api/orders?limit=100", null, token);
      assert.equal(res.status, 200);
      const broken = listPayload(res.json).find((o) => o.id === orderId);
      assert.ok(broken);
      assert.ok(Array.isArray(broken.items));
      assert.equal(broken.items.length, 0);
      const del = await request("DELETE", "/api/orders/" + orderId, null, token);
      assert.equal(del.status, 409, "corrupt items must block delete/stock restore");
    } finally {
      try {
        if (db && orderId && originalItems != null) {
          db.prepare("UPDATE orders SET items = ? WHERE id = ?").run(originalItems, orderId);
        }
      } catch {}
      try {
        if (db) db.close();
      } catch {}
    }
  });

  await check("цена с сервера, hack price игнорируется", async () => {
    const res = await request("POST", "/api/orders", {
      name: "Цена",
      phone: "77009993333",
      items: [{ id: product.id, qty: 1, price: 1, name: "HACK" }],
      idempotencyKey: "crmpr" + crypto.randomBytes(4).toString("hex")
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const text = decodeURIComponent(String(res.json.whatsapp).split("text=")[1] || "");
    assert.ok(text.includes(product.name));
    assert.ok(!text.includes("HACK"));
    const expected = new Intl.NumberFormat("ru-RU").format(product.price);
    assert.ok(text.includes(expected) || text.includes(String(product.price)));
  });

  // Не оставляем prove-мусор в боевой crm.db.
  // Удаление заказов — через API DELETE, чтобы adjustStock вернул остатки (сырой SQL — нет).
  await check("cleanup: убрать prove-телефоны из БД", async () => {
    const dbPath = path.join(__dirname, "data", "crm.db");
    const markPhones = new Set([phoneA, phoneB, phoneC, "77009993333"]);
    const dbRead = new DatabaseSync(dbPath, { readOnly: true });
    let orderIds = [];
    let clientPhones = [];
    try {
      const leftoverClients = dbRead
        .prepare(
          "SELECT phone FROM clients WHERE note IN ('keep-after-delete', 'keep-me', 'b-note') " +
            "OR name IN ('Клиент А', 'Клиент Б', 'Клиент С', 'CRM Proof', 'Цена')"
        )
        .all();
      for (const row of leftoverClients) markPhones.add(row.phone);
      for (const phone of markPhones) {
        for (const row of dbRead.prepare("SELECT id FROM orders WHERE phone = ?").all(phone)) {
          orderIds.push(row.id);
        }
      }
      clientPhones = [...markPhones];
      orderIds = [...new Set(orderIds)].sort((a, b) => b - a);
    } finally {
      dbRead.close();
    }

    for (const id of orderIds) {
      const del = await request("DELETE", "/api/orders/" + id, null, token);
      // 200 — удалили; 404 — уже нет; 409 corrupt — ниже добьём SQL без склада
      assert.ok(del.status === 200 || del.status === 404 || del.status === 409, "cleanup delete " + id + " → " + del.status);
    }

    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA busy_timeout = 5000;");
    try {
      db.exec("BEGIN IMMEDIATE");
      for (const phone of clientPhones) {
        // Хвосты после 409 / уже удалённых заказов
        const ids = db.prepare("SELECT id FROM orders WHERE phone = ?").all(phone).map((r) => r.id);
        for (const id of ids) {
          db.prepare("DELETE FROM order_keys WHERE order_id = ?").run(id);
          db.prepare("DELETE FROM orders WHERE id = ?").run(id);
        }
        db.prepare("DELETE FROM clients WHERE phone = ?").run(phone);
      }
      db.exec("COMMIT");
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      throw error;
    } finally {
      db.close();
    }
  });

  console.log(results.join("\n"));
  console.log("\n" + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
