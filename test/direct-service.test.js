"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createService } = require("../lib/direct-service");
const details = { items: [{ slug: "galaxy-s25-ultra" }], expectedAmount: 5200,
  customer: { name: "Pessoa Teste", email: "teste@example.com", document: "52998224725", phone: "11999999999",
    address: { zipCode: "01001000", state: "SP", city: "São Paulo", street: "Praça da Sé", number: "1", district: "Sé" } } };
function fixture() {
  let time = 100000, calls = 0, record = null;
  const provider = {
    configuration: () => ({ key: "sk_test_fixture", testMode: true }),
    findByCode: async id => record?.code === id ? record : null,
    get: async () => record,
    create: async ({ payload }) => {
      calls++;
      record ||= { ...payload, id: "or_Test123", amount: 5200, currency: "BRL", status: "pending",
        charges: [{ amount: 5200, payment_method: "pix", status: "pending", last_transaction: { qr_code: "test-code" } }] };
      return record;
    }
  };
  return { provider, service: createService(provider, () => time), advance: ms => time += ms,
    calls: () => calls, record: () => record };
}
test("cria e recupera após reiniciar o serviço sem banco local", async () => {
  const f = fixture(), permit = f.service.prepare(details);
  const order = await f.service.create({ ...details, ...permit });
  assert.equal(order.qr_code, "test-code");
  const restarted = createService(f.provider);
  assert.equal((await restarted.status(permit.requestId, permit.accessToken)).id, permit.requestId);
  assert.equal((await restarted.create({ ...permit, resume: true })).amount, 5200);
  assert.equal(f.calls(), 1);
});
test("repetição de pedido existente não cria outra cobrança mesmo após expirar", async () => {
  const f = fixture(), input = { ...details, ...f.service.prepare(details) };
  await f.service.create(input); f.advance(86400000);
  await f.service.create(input);
  assert.equal(f.calls(), 1);
});
test("recusa permissão expirada, falsificada e payload alterado", async () => {
  const f = fixture(), input = { ...details, ...f.service.prepare(details) };
  await assert.rejects(f.service.create({ ...input, issuedAt: input.issuedAt + 1 }), { code: "invalid_input" });
  await assert.rejects(f.service.create({ ...input, customer: { ...details.customer, name: "Outra Pessoa" } }), { code: "request_conflict" });
  f.advance(60000);
  await assert.rejects(f.service.create(input), { code: "reconciliation_required" });
  assert.equal(f.calls(), 0);
});
test("consulta ausente e recuperação nunca criam cobrança", async () => {
  const f = fixture(), permit = f.service.prepare(details);
  await assert.rejects(f.service.create({ ...permit, resume: true }), { code: "reconciliation_required" });
  assert.equal(f.calls(), 0);
});
test("não expõe pedido a quem não possui token correto", async () => {
  const f = fixture(), input = { ...details, ...f.service.prepare(details) };
  await f.service.create(input);
  await assert.rejects(f.service.status(input.requestId, "a".repeat(64)), { code: "not_found" });
});
test("timeout após criação permite recuperar sem reenviar", async () => {
  const f = fixture(), create = f.provider.create;
  f.provider.create = async input => { await create(input); throw new Error("timeout"); };
  const input = { ...details, ...f.service.prepare(details) };
  await assert.rejects(f.service.create(input), /timeout/);
  assert.equal((await f.service.create({ ...input, resume: true })).status, "pending");
  assert.equal(f.calls(), 1);
});
