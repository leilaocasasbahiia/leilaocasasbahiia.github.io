"use strict";
// Imports only product text and images from the user-supplied visual reference.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const base = "https://leilabahia2026.vercel.app/";
const catalog = require("../catalog.json");
const details = {};
function plain(value) {
  return value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();
}
async function run(product) {
  const response = await fetch(base + "product-" + product.slug + ".html");
  if (!response.ok) throw new Error("Página indisponível: " + product.slug);
  const html = await response.text();
  const description = html.match(/data-panel="descricao"[^>]*>([\s\S]*?)<\/div>/)?.[1] || "";
  const photos = [...html.matchAll(/data-src="([^"]+)"/g)].map(m => m[1]);
  const gallery = [];
  for (const [i, source] of [...new Set(photos)].entries()) {
    const url = new URL(source, base);
    if (url.origin !== new URL(base).origin) continue;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok || !String(response.headers.get("content-type")).startsWith("image/")) continue;
    const ext = path.extname(url.pathname).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) continue;
    const file = "images/products/" + product.slug + "-" + (i + 1) + ext;
    fs.writeFileSync(path.join(root, file), Buffer.from(await response.arrayBuffer())); gallery.push(file);
  }
  details[product.slug] = { gallery: gallery.length ? gallery : [product.img],
    description: [...description.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => plain(m[1])) };
  console.log("Importado: " + product.slug + " (" + gallery.length + " fotos)");
}
(async () => {
  fs.mkdirSync(path.join(root, "images/products"), { recursive: true });
  for (let i = 0; i < catalog.length; i += 4) await Promise.all(catalog.slice(i, i + 4).map(run));
  fs.writeFileSync(path.join(root, "product-details.json"), JSON.stringify(details, null, 2) + "\n");
})().catch(error => { console.error(error.message); process.exitCode = 1; });
