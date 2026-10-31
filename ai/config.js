"use strict";

function cleanPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return /^7\d{10}$/.test(digits) ? digits : "";
}

function loadConfig(env, overrides) {
  const source = env || process.env;
  const extra = overrides || {};
  const phone =
    cleanPhone(extra.phone) ||
    cleanPhone(source.WHATSAPP_PHONE) ||
    cleanPhone(source.AI_WHATSAPP_PHONE) ||
    "77028711150";
  return {
    apiKey: source.AI_API_KEY || "",
    baseUrl: (source.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: source.AI_MODEL || "gpt-5.4-mini",
    phone,
    timeoutMs: 25_000,
    maxTokens: 700,
    temperature: 0.3,
    chatRateMax: Number(source.CHAT_RATE_MAX) || 20,
    chatFileRateMax: Number(source.CHAT_FILE_RATE_MAX) || 5,
    llmGlobalMax: Number(source.CHAT_LLM_GLOBAL_MAX) || 4,
    llmPerIpMax: Number(source.CHAT_LLM_PER_IP_MAX) || 1
  };
}

module.exports = { loadConfig };
