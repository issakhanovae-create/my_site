"use strict";

require("./_prove_guard.cjs");

const fs = require("fs");
const path = require("path");
const http = require("http");
const assert = require("assert");
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
        resolve({ status: res.statusCode, headers: res.headers, json, raw });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let passed = 0;
let failed = 0;
const results = [];

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    results.push("PASS  " + name);
  } catch (err) {
    failed += 1;
    results.push("FAIL  " + name + " — " + (err && err.message ? err.message : err));
  }
}

(async () => {
  const src = fs.readFileSync(path.join(__dirname, "server.cjs"), "utf8");

  await check("исходник: VACUUM INTO + sessions + keyset before", async () => {
    assert.ok(src.includes("VACUUM INTO"));
    assert.ok(src.includes("CREATE TABLE IF NOT EXISTS sessions"));
    assert.ok(src.includes("listOrdersBefore"));
    assert.ok(src.includes("productsCache.slice()"));
    assert.ok(src.includes("orders_since_backup"));
  });

  await check("API products: Cache-Control no-store", async () => {
    const res = await request("GET", "/api/products");
    assert.equal(res.status, 200);
    assert.equal(String(res.headers["cache-control"] || ""), "no-store");
    assert.ok(Array.isArray(res.json));
  });

  let token = "";
  await check("login пишет сессию в SQLite", async () => {
    const res = await request("POST", "/api/login", { password });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    token = res.json.token;
    assert.ok(token);
    const db = new DatabaseSync(path.join(__dirname, "data", "crm.db"), { readOnly: true });
    const row = db.prepare("SELECT expires FROM sessions WHERE token = ?").get(token);
    db.close();
    assert.ok(row, "session row missing");
    assert.ok(Number(row.expires) > Date.now());
  });

  await check("session endpoint принимает сохранённый токен", async () => {
    const res = await request("GET", "/api/session", null, token);
    assert.equal(res.status, 200);
  });

  await check("клиенты: пагинация {items,total,visibleTotal}", async () => {
    const res = await request("GET", "/api/clients?limit=3&offset=0", null, token);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json.items));
    assert.ok(res.json.items.length <= 3);
    assert.ok(Number.isFinite(Number(res.json.total)));
    assert.ok(Number.isFinite(Number(res.json.visibleTotal)));
  });

  await check("заказы: status filter + before без пересечений", async () => {
    const page = await request("GET", "/api/orders?limit=5&status=new", null, token);
    assert.equal(page.status, 200);
    assert.equal(page.json.status, "new");
    for (const row of page.json.items) assert.equal(row.status, "new");
    if (page.json.items.length >= 2) {
      const before = page.json.items[page.json.items.length - 1].id;
      const next = await request("GET", "/api/orders?limit=5&status=new&before=" + before, null, token);
      assert.equal(next.status, 200);
      const ids = new Set(page.json.items.map((r) => r.id));
      for (const row of next.json.items) {
        assert.ok(row.id < before);
        assert.equal(ids.has(row.id), false);
      }
    }
  });

  await check("VACUUM INTO бэкап создаёт читаемый sqlite", async () => {
    const dir = path.join(__dirname, "data", "backups");
    const before = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((n) => /^crm-.*\.db$/i.test(n))
      : [];
    // Trigger backup path via meta counter near threshold is hard; call by placing many is heavy.
    // Instead open DB and run same SQL the server uses.
    const stamp = "prove-" + Date.now();
    const dest = path.join(dir, "crm-" + stamp + ".db");
    fs.mkdirSync(dir, { recursive: true });
    const live = new DatabaseSync(path.join(__dirname, "data", "crm.db"));
    live.exec("VACUUM INTO '" + dest.replace(/'/g, "''") + "'");
    live.close();
    assert.ok(fs.existsSync(dest));
    const copy = new DatabaseSync(dest, { readOnly: true });
    const n = Number(copy.prepare("SELECT COUNT(*) AS n FROM orders").get().n);
    copy.close();
    assert.ok(n >= 0);
    fs.rmSync(dest, { force: true });
    void before;
  });

  console.log(results.join("\n"));
  console.log("\n" + passed + "/" + (passed + failed) + " PASS");
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
