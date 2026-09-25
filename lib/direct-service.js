"use strict";
const { randomUUID, randomBytes, createHmac } = require("node:crypto");
const { CheckoutError, quote, customerData, validateAccess, hash, secretEquals, orderPayload, providerState } = require("./checkout");
const catalog = require("../catalog.json");
const INTEGRATION = "arremata-pix-v2";
// Shorter than the provider's five-minute sandbox idempotency window.
const CREATE_WINDOW = 60_000;
function createService(provider, now = Date.now) {
  function signature(permit) {
    return createHmac("sha256", provider.configuration().key)
      .update(JSON.stringify([INTEGRATION, permit.requestId, hash(permit.accessToken), permit.issuedAt, permit.requestHash])).digest("hex");
  }
  function payloadFor(input, id) {
    const summary = quote(input.items);
    if (input.expectedAmount !== summary.amount) throw new CheckoutError(409,
      "Os preços foram atualizados. Confira o resumo antes de gerar o Pix.", "price_changed");
    return orderPayload(id, summary, customerData(input.customer));
  }
  function restore(result, id, token) {
    const metadata = result?.metadata;
    if (!metadata || metadata.integration !== INTEGRATION || !secretEquals(metadata.access_hash, hash(token))) {
      throw new CheckoutError(404, "Pedido não encontrado para este acesso.", "not_found");
    }
    if (metadata.test_mode !== String(provider.configuration().testMode)) {
      throw new CheckoutError(409, "Este pedido pertence a outro ambiente de pagamento.", "environment_mismatch");
    }
    const items = (result.items || []).map(item => ({ slug: item.code, title: item.description,
      img: catalog.find(p => p.slug === item.code)?.img || "", quantity: item.quantity, amount: item.amount }));
    if (!items.length || items.some(p => p.quantity !== 1 || !Number.isSafeInteger(p.amount) || p.amount <= 0) ||
        items.reduce((sum, p) => sum + p.amount, 0) !== result.amount) {
      throw new CheckoutError(502, "Não foi possível conferir os itens do pedido.", "provider_mismatch");
    }
    const order = { id, amount: result.amount, snapshot: { items }, test_mode: provider.configuration().testMode };
    return { ...order, ...providerState(result, order) };
  }
  async function find(id, token) {
    validateAccess(id, token);
    const found = await provider.findByCode(id);
    return found ? restore(await provider.get(found.id), id, token) : null;
  }
  async function status(id, token) {
    const order = await find(id, token);
    if (!order) throw new CheckoutError(409,
      "O pedido ainda não foi localizado na Pagar.me. Consulte novamente; se persistir, informe o número à loja antes de tentar outra compra.", "reconciliation_required");
    return order;
  }
  return {
    prepare(input) {
      provider.configuration();
      // A client cannot renew the creation permit for an old order ID.
      const requestId = randomUUID();
      const payload = payloadFor(input, requestId);
      const permit = { requestId, accessToken: randomBytes(32).toString("hex"), issuedAt: now(), requestHash: hash(JSON.stringify(payload)) };
      return { ...permit, signature: signature(permit) };
    },
    async create(input) {
      validateAccess(input?.requestId, input?.accessToken);
      if (input.resume === true) return status(input.requestId, input.accessToken);
      if (!Number.isSafeInteger(input.issuedAt) || typeof input.requestHash !== "string" || !secretEquals(input.signature, signature(input))) {
        throw new CheckoutError(400, "Autorização do pedido inválida.", "invalid_input");
      }
      const existing = await find(input.requestId, input.accessToken);
      if (existing) return existing;
      const payload = payloadFor(input, input.requestId);
      if (!secretEquals(input.requestHash, hash(JSON.stringify(payload)))) {
        throw new CheckoutError(409, "Os dados deste pedido foram alterados. Consulte o pedido existente.", "request_conflict");
      }
      // Check immediately before POST, including lookup time.
      if (now() < input.issuedAt || now() - input.issuedAt >= CREATE_WINDOW) {
        throw new CheckoutError(409, "O prazo de criação terminou. Consulte o pedido ou informe o número à loja.", "reconciliation_required");
      }
      payload.metadata = { ...payload.metadata, integration: INTEGRATION, access_hash: hash(input.accessToken),
        request_hash: input.requestHash, test_mode: String(provider.configuration().testMode) };
      return restore(await provider.create({ id: input.requestId, payload }), input.requestId, input.accessToken);
    },
    status
  };
}
module.exports = { createService };
