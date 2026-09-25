"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.resolve(root, "public");
if (path.dirname(output) !== root || path.basename(output) !== "public") throw new Error("Diretório de saída inválido.");
// Only the generated public directory is replaced. Server files and secrets stay out of it.
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
const assets = ["catalog.json", "campaign.json", "css", "images"];
for (const asset of assets) fs.cpSync(path.join(root, asset), path.join(output, asset), { recursive: true });
fs.mkdirSync(path.join(output, "js"), { recursive: true });
fs.copyFileSync(path.join(root, "js/checkout-preview.js"), path.join(output, "js/checkout-preview.js"));
for (const script of ['pricing.js','cart.js','shop.js','campaign.js','admin.js']) fs.copyFileSync(path.join(root,'js',script),path.join(output,'js',script));
fs.copyFileSync(path.join(root,'admin.html'),path.join(output,'admin.html'));
fs.copyFileSync(path.join(root,'obrigado.html'),path.join(output,'obrigado.html'));
const template = require("./demo-template");
const catalog = require("../catalog.json");
for (const product of catalog) {
  if (!/^[a-z0-9-]+$/.test(product.slug) || !Number.isSafeInteger(product.priceCents) || product.priceCents <= 0 ||
      !Number.isSafeInteger(product.backPriceCents) || product.backPriceCents <= 0) throw new Error("Produto inválido no catálogo.");
  fs.writeFileSync(path.join(output, `product-${product.slug}.html`), template.product(product));
}
fs.writeFileSync(path.join(output, "index.html"), template.home(catalog));
fs.writeFileSync(path.join(output, "checkout.html"), template.closed());
fs.writeFileSync(path.join(output, "product.html"), template.home(catalog));
console.log("Build pronto: catálogo e checkout Pix com conferência manual.");
