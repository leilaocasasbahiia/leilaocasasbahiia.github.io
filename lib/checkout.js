"use strict";
const { createHash, timingSafeEqual } = require("node:crypto");
const catalog = require("../catalog.json");
const pricing = require("../js/pricing");
const products = new Map(catalog.map(p => [p.slug, p]));

class CheckoutError extends Error {
  constructor(status, message, code = "checkout_error") {
    super(message); this.status = status; this.code = code;
  }
}
const fail = (message) => { throw new CheckoutError(400, message, "invalid_input"); };
const hash = value => createHash("sha256").update(value).digest("hex");
function secretEquals(a, b) {
  return typeof a === "string" && typeof b === "string" &&
    timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
}
function quote(items, enableBack = process.env.ENABLE_BACK_OFFER !== "false") {
  if (!Array.isArray(items) || !items.length || items.length > catalog.length) fail("Escolha pelo menos um produto válido.");
  const seen = new Set();
  const lines = items.map(item => {
    const product = products.get(item?.slug);
    if (!product || seen.has(product.slug)) fail("O carrinho contém um produto inválido ou repetido.");
    if (item.quantity !== undefined && item.quantity !== 1) fail("Cada produto pode ter uma unidade por pedido.");
    seen.add(product.slug);
    const back = enableBack && item.back === true;
    // Nunca aceitar preço, título, imagem ou total enviados pelo navegador.
    return { slug: product.slug, title: product.title, img: product.img, quantity: 1,
      back, amount: pricing.total(back ? product.backPriceCents : product.priceCents) };
  }).sort((a, b) => a.slug.localeCompare(b.slug));
  const amount = lines.reduce((sum, line) => sum + line.amount, 0);
  if (!Number.isSafeInteger(amount) || amount <= 0) fail("Total inválido.");
  return { items: lines, amount, currency: "BRL" };
}
function field(value, label, min = 1, max = 120) {
  if (typeof value !== "string") fail("Preencha " + label + ".");
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < min || text.length > max) fail("Confira " + label + ".");
  return text;
}
function validCpf(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let size = 9; size <= 10; size++) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    const digit = (sum * 10) % 11 % 10;
    if (digit !== Number(cpf[size])) return false;
  }
  return true;
}
function customerData(input, { optional = false } = {}) {
  const readField = (value, ...rules) => {
    if (optional && (value == null || (typeof value === "string" && !value.trim()))) return "";
    return field(value, ...rules);
  };
  const name = readField(input?.name, "o nome completo", 3, 100);
  const email = readField(input?.email, "o e-mail", 5, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Informe um e-mail válido.");
  const document = readField(input?.document, "o CPF", 11, 18).replace(/\D/g, "");
  if ((!optional || input?.document?.trim()) && !validCpf(document)) fail("Informe um CPF válido.");
  let phone = readField(input?.phone, "o telefone com DDD", 10, 22).replace(/\D/g, "");
  if (phone.length > 11 && phone.startsWith("55")) phone = phone.slice(2);
  if ((!optional || input?.phone?.trim()) && !/^[1-9]{2}\d{8,9}$/.test(phone)) fail("Informe um telefone válido com DDD.");
  const a = input?.address;
  const zip = readField(a?.zipCode, "o CEP", 8, 9).replace(/\D/g, "");
  if ((!optional || a?.zipCode?.trim()) && !/^\d{8}$/.test(zip)) fail("Informe um CEP válido.");
  const state = readField(a?.state, "o estado", 2, 2).toUpperCase();
  if (state && !"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ").includes(state)) fail("Informe uma UF válida.");
  const number = readField(a?.number, "o número do endereço", 1, 15);
  const street = readField(a?.street, "a rua", 2, 90);
  const district = readField(a?.district, "o bairro", 2, 60);
  const address = { country: "BR", state, city: readField(a?.city, "a cidade", 2, 60),
    zip_code: zip, line_1: [number, street, district].filter(Boolean).join(", ") };
  if (a?.complement) address.line_2 = readField(a.complement, "o complemento", 1, 80);
  return { name, email, document, document_type: "CPF", type: "individual", address,
    phones: { mobile_phone: { country_code: "55", area_code: phone.slice(0, 2), number: phone.slice(2) } } };
}
function validateAccess(id, token) {
  if (typeof id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id) ||
    typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) fail("Identificação do pedido inválida.");
}
function orderPayload(id, summary, customer) {
  return { code: id, closed: true, customer,
    items: summary.items.map(p => ({ code: p.slug, amount: p.amount, description: p.title, quantity: 1 })),
    shipping: { amount: 0, description: "Entrega no endereço informado", recipient_name: customer.name,
      recipient_phone: "55" + customer.phones.mobile_phone.area_code + customer.phones.mobile_phone.number, address: customer.address },
    payments: [{ payment_method: "pix", pix: { expires_in: 1800 } }],
    metadata: { store_order_id: id, integration: "arremata-pix-v1" } };
}
function providerState(provider, order, now = Date.now()) {
  if (!provider || !/^or_[A-Za-z0-9]+$/.test(provider.id || "") ||
      provider.code !== order.id || provider.amount !== order.amount || provider.currency !== "BRL" ||
      (order.provider_id && provider.id !== order.provider_id)) {
    throw new CheckoutError(502, "Não foi possível validar a cobrança. Tente consultar novamente.", "provider_mismatch");
  }
  const charges = provider.charges || [];
  if (charges.length !== 1 || charges[0].amount !== order.amount ||
      String(charges[0].payment_method).toLowerCase() !== "pix") {
    throw new CheckoutError(502, "A cobrança recebida não corresponde ao pedido.", "provider_mismatch");
  }
  const charge = charges[0], transaction = charge.last_transaction || {};
  let status = "pending";
  const paidAmount = Number(charge.paid_amount || 0);
  if (["refunded", "pending_refund"].includes(transaction.status) || charge.status === "refunded") status = "refunded";
  else if (charge.status === "paid" && provider.status === "paid" && paidAmount === order.amount) status = "paid";
  else if (["underpaid", "overpaid", "chargedback", "partial_canceled"].includes(charge.status) ||
    (paidAmount > 0 && paidAmount !== order.amount)) status = "review";
  else if (["failed", "canceled"].includes(provider.status) || ["failed", "canceled"].includes(charge.status) ||
    ["failed", "with_error"].includes(transaction.status)) status = "failed";
  else if (transaction.expires_at && Date.parse(transaction.expires_at) <= now) status = "expired";
  // A transient stale response must not revoke a previously verified payment.
  if (order.status === "refunded") status = "refunded";
  else if (order.status === "paid" && ["pending", "expired", "failed"].includes(status)) status = "paid";
  let qrUrl = null;
  if (typeof transaction.qr_code_url === "string") {
    try { const url = new URL(transaction.qr_code_url); if (url.protocol === "https:") qrUrl = url.href; } catch (_) {}
  }
  return { provider_id: provider.id, status, paid_amount: paidAmount,
    qr_code: typeof transaction.qr_code === "string" ? transaction.qr_code : null,
    qr_code_url: qrUrl, expires_at: transaction.expires_at || null };
}
function publicOrder(order) {
  return { id: order.id, status: order.status, amount: order.amount, currency: "BRL",
    items: order.snapshot.items, qrCode: order.status === "pending" ? order.qr_code : null,
    qrCodeUrl: order.status === "pending" ? order.qr_code_url : null, expiresAt: order.expires_at,
    testMode: order.test_mode };
}
module.exports = { CheckoutError, quote, hash, secretEquals, customerData, validateAccess, orderPayload, providerState, publicOrder, validCpf };
