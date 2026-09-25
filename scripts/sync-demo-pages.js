"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const template = require("./demo-template");
const catalog = require("../catalog.json");
for (const [name, content] of Object.entries({"index.html":template.home(catalog),"product.html":template.home(catalog),"checkout.html":template.closed()})) {
  fs.writeFileSync(path.join(root, name), content);
}
for (const product of catalog) {
  if (!/^[a-z0-9-]+$/.test(product.slug)) throw new Error('Slug inválido');
  fs.writeFileSync(path.join(root, `product-${product.slug}.html`), template.product(product));
}
