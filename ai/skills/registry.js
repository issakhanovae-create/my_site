"use strict";

function createRegistry() {
  const skills = [];

  function register(skill) {
    if (!skill || !skill.id || typeof skill.match !== "function" || typeof skill.handle !== "function") {
      throw new Error("invalid skill");
    }
    skills.push(skill);
    return skill;
  }

  function firstMatch(ctx) {
    for (const skill of skills) {
      if (skill.match(ctx)) return skill;
    }
    return null;
  }

  function list() {
    return skills.slice();
  }

  return { register, firstMatch, list };
}

module.exports = { createRegistry };
