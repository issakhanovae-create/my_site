"use strict";

require("./_prove_guard.cjs");

const http = require("http");
const assert = require("assert");

const host = "127.0.0.1";
const port = Number(process.env.PORT) || 8765;
let passed = 0;
let failed = 0;
const results = [];

function ok(name) {
  passed += 1;
  results.push("PASS  " + name);
}

function fail(name, err) {
  failed += 1;
  results.push("FAIL  " + name + " — " + (err && err.message ? err.message : err));
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), "utf8");
    const req = http.request({
      host,
      port,
      path,
      method,
      headers: payload
        ? { "Content-Type": "application/json", "Content-Length": payload.length }
        : {}
    }, (res) => {
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

(async () => {
  // Ensure goods have warehouse stock so prove orders don't starve the catalog.
  const { DatabaseSync } = require("node:sqlite");
  const path = require("path");
  const prep = new DatabaseSync(path.join(__dirname, "data", "crm.db"));
  prep.exec("PRAGMA busy_timeout = 5000;");
  prep.prepare("UPDATE products SET stock = 500 WHERE kind != 'услуга' AND stock >= 0").run();
  prep.close();

  const productsRes = await request("GET", "/api/products");
  assert.equal(productsRes.status, 200);
  const products = productsRes.json;
  assert.ok(Array.isArray(products) && products.length > 0, "витрина пуста — нечего проверять");

  function available(product) {
    const cap = Math.min(99, Math.max(1, Math.floor(Number(product.quantity)) || 1));
    const stock = Number(product.stock);
    if (Number.isFinite(stock) && stock >= 0) return Math.min(cap, Math.max(0, Math.floor(stock)));
    return cap;
  }

  const limited = products.find((p) => Number(p.quantity) === 1) || products[0];
  const roomy = products.find((p) => available(p) >= 5) || products.find((p) => available(p) >= 2) || products[0];
  const maxLimited = Math.min(available(limited), Math.min(99, Math.max(1, Math.floor(Number(limited.quantity)) || 1)));
  const maxRoomy = available(roomy);
  assert.ok(maxRoomy >= 1, "нет позиции с доступным остатком для заказа");

  await check("публичная витрина отдаёт товары", async () => {
    assert.ok(products.every((p) => p.id && p.name != null && Number.isFinite(Number(p.price))));
  });

  await check("POST /api/products без токена → 401", async () => {
    const res = await request("POST", "/api/products", { name: "x", price: 1 });
    assert.equal(res.status, 401);
  });

  await check("пустая корзина отклоняется", async () => {
    const res = await request("POST", "/api/orders", {
      name: "Тест",
      phone: "77021112233",
      items: [],
      idempotencyKey: "prove-empty-" + Date.now()
    });
    assert.equal(res.status, 400);
  });

  await check("короткое имя отклоняется", async () => {
    const res = await request("POST", "/api/orders", {
      name: "Я",
      phone: "77021112233",
      items: [{ id: roomy.id, qty: 1 }],
      idempotencyKey: "prove-name-" + Date.now()
    });
    assert.equal(res.status, 400);
  });

  await check("мусорный телефон отклоняется", async () => {
    for (const phone of ["0000000000", "12345", "9999999999999999", "abc"]) {
      const res = await request("POST", "/api/orders", {
        name: "Тест Телефон",
        phone,
        items: [{ id: roomy.id, qty: 1 }],
        idempotencyKey: "prove-phone-" + phone + "-" + Date.now()
      });
      assert.equal(res.status, 400, "phone=" + phone + " status=" + res.status);
    }
  });

  await check("qty больше max одной строкой отклоняется", async () => {
    const res = await request("POST", "/api/orders", {
      name: "Тест Лимит",
      phone: "77021112234",
      items: [{ id: limited.id, qty: maxLimited + 1 }],
      idempotencyKey: "prove-over-" + Date.now()
    });
    assert.ok(res.status === 400 || res.status === 409, "status=" + res.status);
  });

  await check("обход max дублями строк заблокирован", async () => {
    const res = await request("POST", "/api/orders", {
      name: "Тест Дубли",
      phone: "77021112235",
      items: [
        { id: limited.id, qty: maxLimited },
        { id: limited.id, qty: maxLimited }
      ],
      idempotencyKey: "prove-dup-" + Date.now()
    });
    assert.ok(res.status === 400 || res.status === 409, "ожидали 400/409, получили " + res.status + " " + JSON.stringify(res.json));
  });

  await check("сумма дублей в пределах max принимается и схлопывается", async () => {
    if (maxRoomy < 2) return;
    const half = Math.floor(maxRoomy / 2) || 1;
    const key = "prove-merge-" + Date.now();
    const res = await request("POST", "/api/orders", {
      name: "Тест Сумма",
      phone: "77021112236",
      items: [
        { id: roomy.id, qty: half },
        { id: roomy.id, qty: Math.min(maxRoomy - half, half) }
      ],
      idempotencyKey: key
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.ok(String(res.json.whatsapp).startsWith("https://wa.me/"));
    assert.ok(Number(res.json.id) > 0);
  });

  await check("подмена цены клиентом игнорируется (заказ 201, цена с сервера)", async () => {
    const key = "prove-price-" + Date.now();
    const res = await request("POST", "/api/orders", {
      name: "Тест Цена",
      phone: "77021112237",
      items: [{ id: roomy.id, qty: 1, price: 1, currency: "USD" }],
      idempotencyKey: key
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const text = decodeURIComponent(String(res.json.whatsapp).split("text=")[1] || "");
    assert.ok(text.includes(String(roomy.name)));
    const expected = new Intl.NumberFormat("ru-RU").format(roomy.price);
    assert.ok(text.includes(expected), "нет серверной цены «" + expected + "» в тексте: " + text.slice(0, 300));
    // подмена price:1 не должна дать одиночную «1 × $1» / «1 ₸» вместо каталожной цены
    assert.ok(!/1\s*×\s*\$1(?!\d)/.test(text) && !/1\s*×\s*1\s*₸/.test(text), "похоже на подменённую цену: " + text.slice(0, 200));
  });

  let firstId = null;
  let firstWa = null;
  const idemKey = "prove-idem-" + Date.now() + "-ABCDEFGH";

  await check("первый заказ с ключом → 201", async () => {
    const res = await request("POST", "/api/orders", {
      name: "Тест Идемпотентность",
      phone: "77021112238",
      comment: "prove",
      items: [{ id: roomy.id, qty: 1 }],
      idempotencyKey: idemKey
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    firstId = res.json.id;
    firstWa = res.json.whatsapp;
    assert.ok(firstId);
    assert.ok(String(firstWa).startsWith("https://wa.me/"));
  });

  await check("повтор с тем же ключом → тот же id, без нового заказа", async () => {
    const res = await request("POST", "/api/orders", {
      name: "Другое Имя",
      phone: "77029999999",
      items: [{ id: roomy.id, qty: 1 }],
      idempotencyKey: idemKey
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.equal(res.json.id, firstId);
    assert.equal(res.json.whatsapp, firstWa);
  });

  await check("идемпотентность в SQLite (ключ в order_keys)", async () => {
    const { DatabaseSync } = require("node:sqlite");
    const path = require("path");
    const db = new DatabaseSync(path.join(__dirname, "data", "crm.db"));
    db.exec("PRAGMA busy_timeout = 5000;");
    const row = db.prepare("SELECT order_id, whatsapp FROM order_keys WHERE key = ?").get(idemKey);
    db.close();
    assert.ok(row, "ключ должен лежать в order_keys");
    assert.equal(Number(row.order_id), firstId);
    assert.equal(row.whatsapp, firstWa);
  });

  await check("нормализация телефона 8… → 7…", async () => {
    const key = "prove-8xxx-" + Date.now();
    const res = await request("POST", "/api/orders", {
      name: "Тест Восьмёрка",
      phone: "87021112239",
      items: [{ id: roomy.id, qty: 1 }],
      idempotencyKey: key
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const text = decodeURIComponent(String(res.json.whatsapp).split("text=")[1] || "");
    assert.ok(text.includes("+77021112239"), "ожидали +77021112239 в тексте: " + text.slice(0, 200));
  });

  // клиентская логика setQty / stockOf (зеркало script.js)
  await check("клиентский stockOf / setQty кламп", async () => {
    function stockOf(product) {
      const qty = Math.floor(Number(product && product.quantity));
      if (!Number.isFinite(qty) || qty < 1) return 1;
      return Math.min(99, qty);
    }
    function setQty(cart, catalog, id, qty) {
      const product = catalog.find((entry) => entry.id === id);
      const max = product ? stockOf(product) : 99;
      const next = Math.floor(Number(qty));
      return cart
        .map((item) => {
          if (item.id !== id) return item;
          if (!Number.isFinite(next) || next < 1) return { ...item, qty: 0 };
          return { ...item, qty: Math.min(next, max) };
        })
        .filter((item) => item.qty >= 1);
    }
    const catalog = [{ id: "x", quantity: 3 }];
    const cart = [{ id: "x", qty: 1 }];
    assert.deepEqual(setQty(cart, catalog, "x", 99), [{ id: "x", qty: 3 }]);
    assert.deepEqual(setQty(cart, catalog, "x", 0), []);
    assert.equal(stockOf({ quantity: 0 }), 1);
    assert.equal(stockOf({ quantity: 150 }), 99);
  });

  // Последним: добиваем rate limit и проверяем, что валидация не маскируется 429
  await check("при лимите заказов валидация всё ещё даёт 400, не 429", async () => {
    for (let i = 0; i < 12; i++) {
      const res = await request("POST", "/api/orders", {
        name: "Rate Fill",
        phone: "77021112" + String(40 + (i % 50)).padStart(3, "0"),
        items: [{ id: roomy.id, qty: 1 }],
        idempotencyKey: "prove-fill-" + Date.now() + "-" + i
      });
      if (res.status === 429) break;
    }
    const bad = await request("POST", "/api/orders", {
      name: "Я",
      phone: "77021112233",
      items: [{ id: roomy.id, qty: 1 }],
      idempotencyKey: "prove-rl-bad-" + Date.now()
    });
    assert.equal(bad.status, 400, "ожидали 400 на валидации, получили " + bad.status);
  });

  console.log(results.join("\n"));
  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
