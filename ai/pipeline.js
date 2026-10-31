"use strict";

const { takeAttachment } = require("./attachments");

function createPipeline(deps) {
  const { getProducts, config, client, session, rateLimit, registry } = deps;

  async function handleChat(req, rawBody, extras) {
    const opt = extras || {};
    const ip =
      (typeof opt.ip === "string" && opt.ip) ||
      (req && req.socket && req.socket.remoteAddress) ||
      "local";
    const signal = opt.signal;

    if (rateLimit.chatLimited(ip)) {
      return { status: 429, body: { error: "Слишком много вопросов. Подождите минуту." } };
    }

    let body;
    try {
      body = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || ""));
    } catch {
      return { status: 400, body: { error: "Не получилось прочитать вопрос" } };
    }

    try {
      const sessionId = session.cleanSessionId(body.sessionId);
      const typed = String(body.message || "").trim().slice(0, 800);

      // File rate-limit ДО decode/parse — иначе DoS уже оплачен CPU/RAM.
      const rawFile = body.file;
      const hasFile = Boolean(rawFile && typeof rawFile === "object" && rawFile.data);
      if (hasFile && rateLimit.chatFileLimited(ip)) {
        return { status: 429, body: { error: "Слишком много файлов. Подождите минуту." } };
      }

      let attachment = null;
      try {
        attachment = takeAttachment(rawFile);
      } catch (error) {
        if (error && error.code === "big") {
          return { status: 400, body: { error: "Файл больше 4 МБ" } };
        }
        throw error;
      }

      const question = typed || (attachment ? "Прочитай вложение." : "");
      if (!question) {
        return { status: 400, body: { error: "Напишите вопрос" } };
      }

      const products = typeof getProducts === "function" ? getProducts() : [];
      const history = session.history(sessionId);
      const ctx = {
        question,
        sessionId,
        mode: body.mode,
        passToken: body.passToken,
        attachment,
        ip,
        products,
        history,
        config,
        client,
        session,
        rateLimit,
        signal
      };

      const skill = registry.firstMatch(ctx);
      if (!skill) {
        return { status: 500, body: { error: "Нет обработчика" } };
      }
      const result = await skill.handle(ctx);
      if (!result || typeof result.status !== "number" || !result.body || typeof result.body !== "object") {
        return { status: 500, body: { error: "Сбой обработчика" } };
      }
      return result;
    } catch (error) {
      if (error && (error.name === "AbortError" || error.code === "ABORT_ERR")) {
        return { status: 499, body: { error: "Запрос отменён" } };
      }
      console.error("chat pipeline", error && error.message ? error.message : error);
      return { status: 500, body: { error: "Не получилось ответить. Попробуйте ещё раз." } };
    }
  }

  return { handleChat };
}

module.exports = { createPipeline };
