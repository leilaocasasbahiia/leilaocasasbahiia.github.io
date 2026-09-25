"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const research = require("../price-research.json");
const refs = new Map(research.products.map(p => [p.slug, p]));
if ((!Number.isInteger(research.percentage) || research.percentage < 1 || research.percentage > 100) || refs.size !== catalog.length || refs.size !== research.products.length) throw new Error("Pesquisa incompleta ou duplicada.");
for (const product of catalog) {
  const ref = refs.get(product.slug);
  if (!ref || !Number.isSafeInteger(ref.referenceCents) || ref.referenceCents <= 0 || !ref.url.startsWith("https://")) throw new Error("Referência inválida: " + product.slug);
  // Integer arithmetic: nearest cent, with half cents rounded up. Idempotent.
  product.priceCents = Math.floor((ref.referenceCents * research.percentage + 50) / 100);
  product.backPriceCents = product.priceCents;
}
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`${catalog.length} valores demonstrativos atualizados para ${research.percentage}% da referência.`);
