"use strict";
// Read-only credential verification; never prints provider records or secrets.
const { randomUUID } = require("node:crypto");
const provider = require("../lib/pagarme");
(async () => {
  const { testMode } = provider.configuration();
  await provider.findByCode(randomUUID());
  console.log("Pagar.me: autenticação e consulta de pedidos OK. Ambiente: " + (testMode ? "teste" : "produção") + ". Nenhuma cobrança criada.");
})().catch(error => {
  console.error("Verificação Pagar.me: " + (error.code || "erro") + ". " + (error.status ? error.message : "Não foi possível concluir a consulta."));
  process.exitCode = 1;
});
