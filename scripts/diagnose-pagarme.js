"use strict";
const fs = require("node:fs");
const { parseEnv } = require("node:util");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const contents = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
const local = parseEnv(contents);
const key = local.PAGARME_SECRET_KEY || "";
console.log(JSON.stringify({
  keyPresent: !!key, secretPrefix: key.startsWith("sk_"), testPrefix: key.startsWith("sk_test_"),
  containsMask: key.includes("*"), containsWhitespace: /\s/.test(key), asciiOnly: /^[\x21-\x7e]*$/.test(key),
  duplicateDefinitions: (contents.match(/^\s*PAGARME_SECRET_KEY\s*=/gm) || []).length > 1,
  environmentMatchesFile: process.env.PAGARME_SECRET_KEY === key,
  configuredEndpoint: local.PAGARME_API_URL === "https://api.pagar.me/core/v5" ? "standard" : "other"
}));
(async () => {
  if (!key.startsWith("sk_") || key.includes("*")) return;
  const response = await fetch("https://api.pagar.me/core/v5/orders?code=" + randomUUID() + "&size=1", {
    headers: { Authorization: "Basic " + Buffer.from(key + ":").toString("base64"), Accept: "application/json" },
    redirect: "error", signal: AbortSignal.timeout(12000)
  });
  const body = await response.text();
  console.log(JSON.stringify({ status: response.status,
    jsonResponse: (response.headers.get("content-type") || "").includes("json"),
    invalidKeyMessage: /invalid.{0,30}(key|credential)|chave.{0,30}inv[aá]lid/i.test(body),
    authenticationMessage: /authenticat|unauthorized|autentica/i.test(body),
    forbiddenMessage: /forbidden|access denied|permission/i.test(body),
    firewallPage: /cloudflare|captcha/i.test(body)
  }));
})().catch(() => { console.error("Consulta indisponível (rede ou timeout). Nenhuma credencial exibida."); process.exitCode = 1; });
