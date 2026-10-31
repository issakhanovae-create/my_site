"use strict";

const crypto = require("crypto");

const MAX_SESSIONS = 500;
const MAX_PASS_TOKENS = 500;

function createSessionStore() {
  const chatSessions = new Map();
  const passTokens = new Map();

  function prune() {
    const now = Date.now();
    for (const [id, entry] of chatSessions) {
      if (now - entry.at > 3_600_000) chatSessions.delete(id);
    }
    for (const [token, entry] of passTokens) {
      if (now - entry.at > 600_000) passTokens.delete(token);
    }
  }

  function evictOldest(map, max) {
    if (map.size < max) return;
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [key, entry] of map) {
      const at = entry && entry.at ? entry.at : 0;
      if (at < oldestAt) {
        oldestAt = at;
        oldestKey = key;
      }
    }
    if (oldestKey != null) map.delete(oldestKey);
  }

  function cleanSessionId(value) {
    const id = String(value || "").trim();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return "";
    return id;
  }

  function history(sessionId) {
    if (!sessionId) return [];
    prune();
    const entry = chatSessions.get(sessionId);
    if (!entry) return [];
    return entry.messages.slice(-6);
  }

  function push(sessionId, userText, assistantText) {
    if (!sessionId) return;
    prune();
    if (!chatSessions.has(sessionId)) evictOldest(chatSessions, MAX_SESSIONS);
    const entry = chatSessions.get(sessionId) || { messages: [], at: Date.now() };
    entry.messages.push({ role: "user", content: userText }, { role: "assistant", content: assistantText });
    if (entry.messages.length > 12) entry.messages.splice(0, entry.messages.length - 12);
    entry.at = Date.now();
    chatSessions.set(sessionId, entry);
  }

  function issuePassToken(sessionId) {
    const sid = cleanSessionId(sessionId);
    if (!sid) return "";
    prune();
    evictOldest(passTokens, MAX_PASS_TOKENS);
    const token = crypto.randomBytes(16).toString("hex");
    passTokens.set(token, { sessionId: sid, at: Date.now() });
    return token;
  }

  function takePassToken(token, sessionId) {
    prune();
    const sid = cleanSessionId(sessionId);
    const key = String(token || "");
    const entry = passTokens.get(key);
    if (!entry) return false;
    // Строгая привязка: пустой sessionId у токена или у запроса — отказ.
    if (!entry.sessionId || !sid || entry.sessionId !== sid) return false;
    passTokens.delete(key);
    return true;
  }

  return { cleanSessionId, history, push, issuePassToken, takePassToken };
}

module.exports = { createSessionStore };
