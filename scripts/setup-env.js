"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const file = path.join(__dirname, "../.env.local");
if (!fs.existsSync(file)) {
  fs.writeFileSync(file, [
    "# Preencha a chave secreta da Pagar.me do ambiente desejado.",
    "PAGARME_SECRET_KEY=",
    "PAGARME_API_URL=https://api.pagar.me/core/v5",
    "PAGARME_WEBHOOK_TOKEN=" + randomBytes(32).toString("hex"),
    "ENABLE_BACK_OFFER=true", ""
  ].join("\n"), { flag: "wx" });
}
console.log(".env.local preparado. Configurações existentes preservadas.");
