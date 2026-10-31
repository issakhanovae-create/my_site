"use strict";

/**
 * Prove-скрипты пишут в боевую SQLite. Без явного флага — стоп.
 * Запуск: ALLOW_PROVE=1 node _prove_….cjs
 */
if (process.env.ALLOW_PROVE !== "1") {
  const name = require("path").basename(process.argv[1] || "_prove_….cjs");
  console.error(
    "Prove-скрипты меняют data/crm.db. Запускайте только с явным флагом:\n" +
      "  PowerShell:  $env:ALLOW_PROVE=\"1\"; node " +
      name +
      "\n" +
      "  cmd.exe:     set ALLOW_PROVE=1&& node " +
      name +
      "\n" +
      "  bash:        ALLOW_PROVE=1 node " +
      name
  );
  process.exit(1);
}

module.exports = {};
