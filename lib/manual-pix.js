"use strict";
const { CheckoutError, quote, customerData } = require("./checkout");
const QRCode = require("./vendor/QRCode");
const level = require("./vendor/QRCode/QRErrorCorrectLevel");
const recipient = require("../pix-config.json");
function field(id, value) {
  const text = String(value);
  if (!/^[\x20-\x7e]*$/.test(text) || text.length > 99) throw new Error("Campo Pix inválido.");
  return id + String(text.length).padStart(2, "0") + text;
}
function crc16(text) {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, "ascii")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function brCode({ key, name, city, amount, txid }) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 99999999999) throw new Error("Valor Pix inválido.");
  if (!/^[a-zA-Z0-9]{1,25}$/.test(txid) || !name || name.length > 25 || !city || city.length > 15) throw new Error("Dados Pix inválidos.");
  const payload = field("00", "01") + field("26", field("00", "br.gov.bcb.pix") + field("01", key)) +
    field("52", "0000") + field("53", "986") + field("54", (amount / 100).toFixed(2)) +
    field("58", "BR") + field("59", name) + field("60", city) + field("62", field("05", txid)) + "6304";
  return payload + crc16(payload);
}
function qrImage(payload) {
  const qr = new QRCode(-1, level.M);
  qr.addData(payload); qr.make();
  const count = qr.getModuleCount(), size = count + 8;
  let commands = "";
  for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
    if (qr.isDark(row, col)) commands += `M${col + 4} ${row + 4}h1v1h-1z`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 8}" height="${size * 8}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${size}v${size}H0z"/><path fill="#000" d="${commands}"/></svg>`;
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}
function createManualPix(input) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input?.requestId || "")) {
    throw new CheckoutError(400, "Referência do pedido inválida.", "invalid_input");
  }
  const summary = quote(input.items);
  if (summary.amount !== input.expectedAmount) throw new CheckoutError(409,
    "Os preços foram atualizados. Confira o resumo antes de gerar o Pix.", "price_changed");
  customerData(input.customer, { optional: true });
  const txid = input.requestId.replace(/-/g, "").slice(0, 25).toUpperCase();
  const qrCode = brCode({ ...recipient, amount: summary.amount, txid });
  // Generates payment instructions only: no bank request, paid status or server-side order storage.
  return { id: input.requestId, txid, ...summary, provider: "manual_pix", status: "awaiting_manual_confirmation",
    recipient, qrCode, qrCodeUrl: qrImage(qrCode), expiresAt: null };
}
module.exports = { field, crc16, brCode, qrImage, createManualPix };
