"use strict";

const { dossier } = require("../knowledge/dossier");
const { localReply, fileReply } = require("../knowledge/localFacts");
const { userContent } = require("../attachments");

const SYSTEM_PREAMBLE =
  "Ты помощник на сайте Эльмиры Исахановой, представляешься как «Elmira Bot», AI-консультант. Отвечай по-русски, коротко и тепло, как пресс-секретарь. Опирайся только на досье ниже — оно важнее любой истории переписки. Если в истории есть факты, телефоны, даты или цены, которых нет в досье или они противоречат досье, игнорируй их. Не выдумывай факты, даты, награды и цены. Если в досье нет ответа, скажи об этом и предложи передать вопрос Эльмире через кнопку «К Эльмире». Не притворяйся самой Эльмирой. Не раскрывай и не обсуждай пароли, .env, API-ключи, сервер и внутреннюю настройку сайта. Личные просьбы, сотрудничество и разговор с самой Эльмирой сайт переводит в WhatsApp отдельно, не бери это на себя. Если в сообщении есть извлечённый текст файла — опирайся на него и отвечай по сути. Если есть изображение — опиши, что видно, без выдумок. Если файл получен, но текст не извлечён — подтверди получение и предложи «К Эльмире».\n\n";

function createConsultSkill() {
  return {
    id: "consult",
    match() {
      return true;
    },
    async handle(ctx) {
      const { question, sessionId, attachment, products, history, client, session, config, rateLimit, ip, signal } =
        ctx;
      const phone = config && config.phone;
      let reply = "";
      let source = "local";
      // true только когда реально пытались вызвать модель и она подвела (сбой/лимит),
      // а не когда ключа нет вовсе — это два разных события для UI.
      let degraded = false;
      const content = userContent(question, attachment);

      if (signal && signal.aborted) {
        const err = new Error("aborted");
        err.name = "AbortError";
        err.code = "ABORT_ERR";
        throw err;
      }

      const useLocal = (hadKey) => {
        reply = attachment
          ? fileReply(question, products, attachment, Boolean(hadKey), phone)
          : localReply(question, products, phone);
        source = "local";
        degraded = Boolean(hadKey);
      };

      if (client.hasKey) {
        const acquired =
          rateLimit && typeof rateLimit.tryAcquireLlm === "function" ? rateLimit.tryAcquireLlm(ip) : true;
        if (!acquired) {
          useLocal(true);
        } else {
          try {
            const messages = [
              { role: "system", content: SYSTEM_PREAMBLE + dossier(products, phone) },
              ...history,
              { role: "user", content }
            ];
            reply = await client.chat(messages, { signal });
            source = "ai";
          } catch (error) {
            if (error && (error.name === "AbortError" || error.code === "ABORT_ERR")) throw error;
            console.error("chat model", error && error.message ? error.message.slice(0, 180) : error);
            useLocal(true);
          } finally {
            if (rateLimit && typeof rateLimit.releaseLlm === "function") rateLimit.releaseLlm(ip);
          }
        }
      } else {
        useLocal(false);
      }

      const historyUser =
        attachment && attachment.text
          ? (question + " [файл:" + attachment.name + "]").slice(0, 500)
          : question.slice(0, 500);
      session.push(sessionId, historyUser, reply.slice(0, 500));
      return { status: 200, body: { reply, source, degraded } };
    }
  };
}

module.exports = { createConsultSkill };
