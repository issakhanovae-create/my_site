"use strict";

const { loadConfig } = require("./config");
const { createClient } = require("./client");
const { createSessionStore } = require("./session");
const { createRateLimit } = require("./rateLimit");
const { createRegistry } = require("./skills/registry");
const { createHandoffSkill } = require("./skills/handoff");
const { createConsultSkill } = require("./skills/consult");
const { createPipeline } = require("./pipeline");

function createAi(deps) {
  const options = deps || {};
  const config = loadConfig(options.env, { phone: options.phone });
  const client = createClient(config);
  const session = createSessionStore();
  const rateLimit = createRateLimit({
    chatMax: Number(config.chatRateMax) || undefined,
    fileMax: Number(config.chatFileRateMax) || undefined,
    llmGlobalMax: Number(config.llmGlobalMax) || undefined,
    llmPerIpMax: Number(config.llmPerIpMax) || undefined
  });
  const registry = createRegistry();

  registry.register(createHandoffSkill());
  if (Array.isArray(options.skills)) {
    for (const skill of options.skills) registry.register(skill);
  }
  // consult — fallback: всегда match, регистрируем последним
  registry.register(createConsultSkill());

  const pipeline = createPipeline({
    getProducts: options.getProducts || (() => []),
    config,
    client,
    session,
    rateLimit,
    registry
  });

  return {
    handleChat: pipeline.handleChat,
    config,
    client,
    session,
    registry
  };
}

module.exports = { createAi, parseFile: require("./parse").parseFile };
