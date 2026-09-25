"use strict";
const { CheckoutError } = require("./checkout");
function configuration() {
  const key = process.env.PAGARME_SECRET_KEY || "";
  if (!/^sk_/.test(key) || key.includes("SUBSTITUA")) throw new CheckoutError(503, "O pagamento Pix ainda não está disponível.", "not_configured");
  const base = (process.env.PAGARME_API_URL || "https://api.pagar.me/core/v5").replace(/\/$/, "");
  if (!["https://api.pagar.me/core/v5", "https://sdx-api.pagar.me/core/v5"].includes(base)) {
    throw new CheckoutError(503, "O pagamento Pix ainda não está disponível.", "not_configured");
  }
  if (base.includes("sdx-api") && !key.startsWith("sk_test_")) throw new CheckoutError(503, "Configuração de pagamento inválida.", "not_configured");
  return { base, key, testMode: key.startsWith("sk_test_") };
}
async function request(path, options = {}) {
  const { base, key } = configuration();
  let response;
  try {
    response = await fetch(base + path, {
      ...options,
      headers: { "Content-Type": "application/json", "Accept": "application/json",
        Authorization: "Basic " + Buffer.from(key + ":").toString("base64"), ...options.headers },
      signal: AbortSignal.timeout(12000)
    });
  } catch (_) {
    throw new CheckoutError(503, "Não foi possível consultar o pagamento agora. Tente novamente para recuperar o mesmo pedido.", "provider_unavailable");
  }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new CheckoutError(503,
      "A Pagar.me não autorizou o acesso. Confira a chave e as permissões da conta.", "provider_auth");
    if (response.status === 409) throw new CheckoutError(409, "Seu Pix está sendo preparado. Aguarde e consulte novamente.", "processing");
    // Never forward provider payloads: they can contain customer data or credentials.
    if ([400, 422].includes(response.status)) throw new CheckoutError(422,
      "A Pagar.me não aceitou a cobrança. Confira os dados ou entre em contato com a loja.", "provider_rejected");
    throw new CheckoutError(503, "O pagamento está indisponível no momento. Tente novamente.", "provider_unavailable");
  }
  try { return await response.json(); }
  catch (_) { throw new CheckoutError(502, "Não foi possível ler a resposta do pagamento.", "provider_unavailable"); }
}
const create = order => request("/orders", { method: "POST", headers: { "Idempotency-key": order.id }, body: JSON.stringify(order.payload) });
function get(id) {
  if (!/^or_[a-zA-Z0-9]+$/.test(id || "")) throw new CheckoutError(400, "Pedido inválido.");
  return request("/orders/" + id);
}
async function findByCode(code) {
  const result = await request("/orders?" + new URLSearchParams({ code, size: "2" }));
  if (!Array.isArray(result.data) || result.data.some(order => order.code !== code)) {
    throw new CheckoutError(502, "Não foi possível validar a consulta do pedido.", "provider_mismatch");
  }
  if (result.data.length > 1) throw new CheckoutError(409,
    "Há mais de um registro para este pedido. Entre em contato com a loja.", "reconciliation_required");
  return result.data[0] || null;
}
module.exports = { configuration, create, get, findByCode };
