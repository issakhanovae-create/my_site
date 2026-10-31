"use strict";

function mergeSignals(timeoutMs, external) {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!external) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([timeout, external]);
  // Fallback if AbortSignal.any unavailable: race via AbortController.
  const ac = new AbortController();
  const stop = () => ac.abort();
  if (timeout.aborted || external.aborted) {
    stop();
    return ac.signal;
  }
  timeout.addEventListener("abort", stop, { once: true });
  external.addEventListener("abort", stop, { once: true });
  return ac.signal;
}

function createClient(config) {
  async function chat(messages, options) {
    if (!config.apiKey) {
      const error = new Error("no key");
      error.code = "no_key";
      throw error;
    }
    const external = options && options.signal;
    const response = await fetch(config.baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.apiKey
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        max_completion_tokens: config.maxTokens,
        messages
      }),
      signal: mergeSignals(config.timeoutMs, external)
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail.slice(0, 180) || "model error");
    }
    const data = await response.json();
    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!reply) throw new Error("empty");
    return String(reply).trim().slice(0, 4000);
  }

  return { chat, hasKey: Boolean(config.apiKey) };
}

module.exports = { createClient };
