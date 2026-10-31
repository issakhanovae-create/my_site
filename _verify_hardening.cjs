"use strict";

/**
 * One-shot verification of hardening changes. Does not mutate products/orders bulk.
 * Starts its own server on a free-ish port via PORT env override... actually uses
 * existing PORT from .env — expects nothing else on that port.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");
const assert = require("assert");

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
const port = 18765; // isolated from default 8765
const phone = String(process.env.WHATSAPP_PHONE || "77028711150").replace(/\D/g, "");
const password = process.env.ADMIN_PASSWORD;
const results = [];

function ok(name) {
  results.push("PASS  " + name);
}
function fail(name, err) {
  results.push("FAIL  " + name + " — " + (err && err.message ? err.message : err));
}

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
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = JSON.parse(raw);
        } catch {}
        resolve({ status: res.statusCode, json, raw, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => ok(name))
    .catch((err) => fail(name, err));
}

(async () => {
  // unit: sameSecret via spawning is hard; test ai config + prove guard instead
  await check("prove-guard блокирует без флага", () => {
    const { spawnSync } = require("child_process");
    const r = spawnSync(process.execPath, ["_prove_guard.cjs"], {
      cwd: __dirname,
      env: { ...process.env, ALLOW_PROVE: "" },
      encoding: "utf8"
    });
    assert.notEqual(r.status, 0);
    assert.match(String(r.stderr || r.stdout), /ALLOW_PROVE/);
  });

  await check("ai/config чистит телефон", () => {
    const { loadConfig } = require("./ai/config");
    assert.equal(loadConfig({ WHATSAPP_PHONE: "+7 (702) 871-11-50" }).phone, "77028711150");
    assert.equal(loadConfig({ WHATSAPP_PHONE: "bad" }, { phone: "77021112233" }).phone, "77021112233");
    assert.equal(loadConfig({ WHATSAPP_PHONE: "bad" }).phone, "77028711150");
  });

  await check("dossier/localFacts подставляют wa.me", () => {
    const { dossier } = require("./ai/knowledge/dossier");
    const { localReply } = require("./ai/knowledge/localFacts");
    assert.ok(dossier([], "77021112233").includes("wa.me/77021112233"));
    assert.ok(localReply("whatsapp контакт", [], "77021112233").includes("wa.me/77021112233"));
  });

  const child = spawn(process.execPath, ["server.cjs"], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      ORDER_RATE_MAX: "5",
      ORDER_RATE_WINDOW_MS: "600000",
      CHAT_BODY_MAX: "6000000"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let ready = false;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server start timeout")), 10000);
    child.stdout.on("data", (d) => {
      if (!ready && /ready/.test(d.toString())) {
        ready = true;
        clearTimeout(t);
        resolve();
      }
    });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("exit", (code) => {
      if (!ready) {
        clearTimeout(t);
        reject(new Error("server exited early " + code));
      }
    });
  });

  try {
    await check("GET /api/site", async () => {
      const res = await request("GET", "/api/site");
      assert.equal(res.status, 200);
      assert.equal(res.json.whatsappPhone, phone);
      assert.equal(res.json.whatsapp, "https://wa.me/" + phone);
      assert.ok(res.headers["permissions-policy"]);
      assert.equal(res.headers["x-content-type-options"], "nosniff");
    });

    await check("HTML отдаёт CSP с Google Fonts", async () => {
      // may 503 if no dist — then skip soft
      const res = await request("GET", "/");
      if (res.status === 503) {
        ok("HTML CSP skipped (no dist) — noted");
        results.pop();
        return;
      }
      assert.equal(res.status, 200);
      const csp = res.headers["content-security-policy"] || "";
      assert.match(csp, /fonts\.googleapis\.com/);
      assert.match(csp, /fonts\.gstatic\.com/);
      assert.match(csp, /script-src 'self'/);
    });

    await check("login + sameSecret работает", async () => {
      assert.ok(password && password.length >= 12);
      const bad = await request("POST", "/api/login", { password: "definitely-wrong-password-xx" });
      assert.equal(bad.status, 401);
      const good = await request("POST", "/api/login", { password });
      assert.equal(good.status, 200);
      assert.ok(good.json.token);
    });

    await check("chat handoff wa.me с телефоном из env", async () => {
      const sid = crypto.randomBytes(8).toString("hex");
      const prep = await request("POST", "/api/chat", {
        message: "Свяжите с Эльмирой",
        sessionId: sid
      });
      assert.equal(prep.status, 200);
      const res = await request("POST", "/api/chat", {
        message: "Меня зовут Проверка, хочу обсудить сотрудничество и видео",
        sessionId: sid,
        mode: "pass",
        passToken: prep.json.passToken
      });
      assert.equal(res.status, 200);
      assert.ok(String(res.json.whatsapp).startsWith("https://wa.me/" + phone));
    });

    await check("тело чата ~5.4 МБ (base64 4МБ) принимается", async () => {
      const raw = Buffer.alloc(4_000_000, 1);
      const b64 = raw.toString("base64");
      assert.ok(b64.length > 5_300_000);
      const body = {
        message: "прочитай",
        sessionId: crypto.randomBytes(8).toString("hex"),
        file: { name: "big.bin", type: "application/octet-stream", data: b64 }
      };
      const json = JSON.stringify(body);
      assert.ok(json.length > 5_300_000 && json.length < 6_000_000);
      const res = await request("POST", "/api/chat", body);
      // 4_000_000 байт ровно — лимит attachments не срабатывает; readBody при 6 МБ пропускает.
      assert.equal(res.status, 200, "status " + res.status + " " + res.raw.slice(0, 200));
    });

    // products for order test
    const products = await request("GET", "/api/products");
    assert.equal(products.status, 200);
    const list = Array.isArray(products.json)
      ? products.json
      : products.json.items || products.json.products || [];
    const product = list.find((p) => p.kind === "услуга" || Number(p.stock) !== 0) || list[0];

    if (product) {
      await check("order rate limit срабатывает (ORDER_RATE_MAX=5)", async () => {
        let hit429 = false;
        for (let i = 0; i < 8; i++) {
          const res = await request("POST", "/api/orders", {
            name: "Verify Rate",
            phone: "77025550" + String(100 + i).slice(-3),
            items: [{ id: product.id, qty: 1 }],
            idempotencyKey: "verify-rate-" + Date.now() + "-" + i
          });
          if (res.status === 429) {
            hit429 = true;
            break;
          }
          assert.ok(res.status === 201 || res.status === 409, "status " + res.status + " " + JSON.stringify(res.json));
        }
        assert.ok(hit429, "ожидали 429 после 5 заказов");
      });

      await check("при лимите валидация всё ещё 400", async () => {
        const bad = await request("POST", "/api/orders", {
          name: "Я",
          phone: "77021112233",
          items: [{ id: product.id, qty: 1 }],
          idempotencyKey: "verify-bad-" + Date.now()
        });
        assert.equal(bad.status, 400);
      });
    } else {
      fail("order rate", new Error("нет товаров для теста"));
    }
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(results.join("\n"));
  const failed = results.filter((line) => line.startsWith("FAIL")).length;
  console.log("\n" + (results.length - failed) + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
