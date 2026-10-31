"use strict";

function createRateLimit(options) {
  const opts = options || {};
  const chatMax = Math.max(1, Number(opts.chatMax) || 20);
  const fileMax = Math.max(1, Number(opts.fileMax) || 5);
  const llmGlobalMax = Math.max(1, Number(opts.llmGlobalMax) || 4);
  const llmPerIpMax = Math.max(1, Number(opts.llmPerIpMax) || 1);

  const chatHits = new Map();
  const chatFileHits = new Map();
  const llmByIp = new Map();
  let llmInflight = 0;

  function pruneHitMap(map, windowMs) {
    const now = Date.now();
    for (const [ip, times] of map) {
      const recent = (times || []).filter((time) => now - time < windowMs);
      if (recent.length) map.set(ip, recent);
      else map.delete(ip);
    }
  }

  function chatLimited(ip) {
    pruneHitMap(chatHits, 60_000);
    const now = Date.now();
    const recent = chatHits.get(ip) || [];
    if (recent.length >= chatMax) {
      chatHits.set(ip, recent);
      return true;
    }
    recent.push(now);
    chatHits.set(ip, recent);
    return false;
  }

  function chatFileLimited(ip) {
    pruneHitMap(chatFileHits, 60_000);
    const now = Date.now();
    const recent = chatFileHits.get(ip) || [];
    if (recent.length >= fileMax) {
      chatFileHits.set(ip, recent);
      return true;
    }
    recent.push(now);
    chatFileHits.set(ip, recent);
    return false;
  }

  function tryAcquireLlm(ip) {
    const key = String(ip || "local");
    const perIp = llmByIp.get(key) || 0;
    if (llmInflight >= llmGlobalMax || perIp >= llmPerIpMax) return false;
    llmInflight += 1;
    llmByIp.set(key, perIp + 1);
    return true;
  }

  function releaseLlm(ip) {
    const key = String(ip || "local");
    llmInflight = Math.max(0, llmInflight - 1);
    const perIp = llmByIp.get(key) || 0;
    if (perIp <= 1) llmByIp.delete(key);
    else llmByIp.set(key, perIp - 1);
  }

  return { chatLimited, chatFileLimited, tryAcquireLlm, releaseLlm };
}

module.exports = { createRateLimit };
