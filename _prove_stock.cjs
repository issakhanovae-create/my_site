"use strict";

require("./_prove_guard.cjs");

const fs = require("fs");
const path = require("path");
const http = require("http");
const assert = require("assert");
const { DatabaseSync } = require("node:sqlite");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
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

function request(method, pathname, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), "utf8");
    const headers = {};
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = payload.length;
    }
    if (token) headers.Authorization = "Bearer " + token;
    const req = http.request({ host, port, path: pathname, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = JSON.parse(raw);
        } catch {}
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  assert.ok(password && password.length >= 12, "ADMIN_PASSWORD required");
  const login = await request("POST", "/api/login", { password });
  assert.equal(login.status, 200);
  const token = login.json.token;

  const created = await request(
    "POST",
    "/api/products",
    {
      name: "Stock Prove",
      price: 10,
      currency: "KZT",
      kind: "товар",
      quantity: 5,
      stock: 3,
      description: "tmp"
    },
    token
  );
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.stock, 3);
  const id = created.json.id;

  const db = new DatabaseSync(path.join(__dirname, "data", "crm.db"));
  db.exec("PRAGMA busy_timeout = 5000;");
  assert.equal(Number(db.prepare("SELECT stock FROM products WHERE id = ?").get(id).stock), 3);

  const over = await request("POST", "/api/orders", {
    name: "Stock Over",
    phone: "77021110001",
    items: [{ id, qty: 4 }],
    idempotencyKey: "stock-over-" + Date.now()
  });
  assert.ok(over.status === 400 || over.status === 409, "expected reject over stock, got " + over.status);

  const ok = await request("POST", "/api/orders", {
    name: "Stock Ok",
    phone: "77021110002",
    items: [{ id, qty: 2 }],
    idempotencyKey: "stock-ok-" + Date.now()
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  assert.equal(Number(db.prepare("SELECT stock FROM products WHERE id = ?").get(id).stock), 1);

  const again = await request("POST", "/api/orders", {
    name: "Stock Again",
    phone: "77021110003",
    items: [{ id, qty: 2 }],
    idempotencyKey: "stock-again-" + Date.now()
  });
  assert.equal(again.status, 409, JSON.stringify(again.json));
  assert.equal(Number(db.prepare("SELECT stock FROM products WHERE id = ?").get(id).stock), 1);

  const cancel = await request("PATCH", "/api/orders/" + ok.json.id, { status: "cancel" }, token);
  assert.equal(cancel.status, 200, JSON.stringify(cancel.json));
  assert.equal(Number(db.prepare("SELECT stock FROM products WHERE id = ?").get(id).stock), 3);

  const service = await request(
    "POST",
    "/api/products",
    { name: "Service Prove", price: 1, currency: "KZT", kind: "услуга", quantity: 2, description: "" },
    token
  );
  assert.equal(service.status, 201);
  assert.equal(service.json.stock, -1);

  const del = await request("DELETE", "/api/products/" + id, null, token);
  assert.equal(del.status, 200);
  await request("DELETE", "/api/products/" + service.json.id, null, token);
  db.close();

  console.log("PASS  stock save + clamp on create");
  console.log("PASS  order decrements stock in SQLite");
  console.log("PASS  oversell rejected with 409");
  console.log("PASS  cancel restores stock");
  console.log("PASS  service stock unlimited (-1)");
  console.log("\n5 passed, 0 failed");
})().catch((error) => {
  console.error("FAIL", error && error.message ? error.message : error);
  process.exit(1);
});
