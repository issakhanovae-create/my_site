"use strict";

function passRequest(question) {
  const text = question.toLowerCase().replace(/ё/g, "е");
  return /перевед(и|ите)|свяжите с|хочу поговорить|хочу написать эльмир|к эльмире|передай(те)? эльмир|лично с эльмир|созвон/.test(text);
}

function passNote(question) {
  return "Здравствуйте, Эльмира. Пишу с вашего сайта.\n\n" + question.trim();
}

function passLink(question, phone) {
  const note = passNote(question).slice(0, 1500);
  return "https://wa.me/" + phone + "?text=" + encodeURIComponent(note);
}

function createHandoffSkill() {
  return {
    id: "handoff",
    match(ctx) {
      if (ctx.attachment) return false;
      if (ctx.mode === "pass") return true;
      return passRequest(ctx.question);
    },
    async handle(ctx) {
      const { question, sessionId, mode, passToken, session, config } = ctx;

      if (mode === "pass") {
        if (!session.takePassToken(passToken, sessionId)) {
          return { status: 400, body: { error: "Сначала попросите перевод к Эльмире" } };
        }
        const reply = "Готово. Эльмира получит этот текст в WhatsApp, когда вы нажмёте отправку.";
        session.push(sessionId, question, reply);
        return { status: 200, body: { reply, whatsapp: passLink(question, config.phone) } };
      }

      const bare = /^(переведите меня к эльмире|хочу поговорить с эльмирой|свяжите с эльмирой)[.!?\s]*$/i.test(question);
      if (bare || question.trim().length < 48) {
        const token = session.issuePassToken(sessionId);
        if (!token) {
          return {
            status: 400,
            body: { error: "Обновите страницу и снова попросите перевод к Эльмире" }
          };
        }
        const reply =
          "Передаю вас Эльмире. Напишите одним сообщением, как к вам обращаться и о чём речь. Я соберу текст для WhatsApp, вам останется его отправить.";
        session.push(sessionId, question, reply);
        return { status: 200, body: { reply, expect: "pass", passToken: token } };
      }

      const reply = "Передаю вас Эльмире с этим текстом. В WhatsApp останется нажать «Отправить».";
      session.push(sessionId, question, reply);
      return { status: 200, body: { reply, whatsapp: passLink(question, config.phone) } };
    }
  };
}

module.exports = { createHandoffSkill, passRequest, passLink };
