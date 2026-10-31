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
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  assert.ok(password && password.length >= 12, "ADMIN_PASSWORD required");

  const before = await request("GET", "/api/products");
  assert.equal(before.status, 200);
  assert.ok(Array.isArray(before.json) && before.json.length >= 1, "catalog empty");

  const login = await request("POST", "/api/login", { password });
  assert.equal(login.status, 200, JSON.stringify(login.json));
  const token = login.json.token;

  const created = await request(
    "POST",
    "/api/products",
    { name: "Prove SQLite", price: 42, currency: "KZT", kind: "товар", quantity: 3, description: "tmp" },
    token
  );
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.name, "Prove SQLite");
  assert.equal(created.json.price, 42);
  const id = created.json.id;

  const db = new DatabaseSync(path.join(__dirname, "data", "crm.db"));
  db.exec("PRAGMA busy_timeout = 5000;");
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  assert.ok(row, "missing sqlite row");
  assert.equal(row.name, "Prove SQLite");
  assert.equal(Number(row.pos), 0);

  const list = await request("GET", "/api/products");
  assert.equal(list.json[0].id, id, "new product should be first");

  const updated = await request(
    "PUT",
    "/api/products/" + id,
    { name: "Prove SQLite 2", price: 43, currency: "RUB", kind: "услуга", quantity: 5, description: "x" },
    token
  );
  assert.equal(updated.status, 200, JSON.stringify(updated.json));
  assert.equal(updated.json.name, "Prove SQLite 2");
  assert.equal(updated.json.currency, "RUB");
  const row2 = db.prepare("SELECT name, currency, quantity FROM products WHERE id = ?").get(id);
  assert.equal(row2.name, "Prove SQLite 2");
  assert.equal(row2.currency, "RUB");
  assert.equal(Number(row2.quantity), 5);

  const del = await request("DELETE", "/api/products/" + id, null, token);
  assert.equal(del.status, 200);
  assert.ok(!db.prepare("SELECT id FROM products WHERE id = ?").get(id));

  const bootstrapped = db.prepare("SELECT value FROM meta WHERE key = ?").get("catalog_bootstrapped");
  assert.ok(bootstrapped && bootstrapped.value === "1", "catalog_bootstrapped meta missing");
  const count = Number(db.prepare("SELECT COUNT(*) AS n FROM products").get().n);
  db.close();
  assert.ok(count >= 1, "catalog should still have real products");

  const after = await request("GET", "/api/products");
  assert.ok(!after.json.some((product) => product.id === id));

  console.log("PASS  product CRUD against SQLite");
  console.log("PASS  API list order / DB row sync");
  console.log("PASS  catalog_bootstrapped meta set (no resurrect on empty wipe)");
  console.log("\n3 passed, 0 failed");
})().catch((error) => {
  console.error("FAIL", error && error.message ? error.message : error);
  process.exit(1);
});
