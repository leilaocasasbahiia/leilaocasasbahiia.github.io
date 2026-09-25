"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { quote, providerState, publicOrder } = require("../lib/checkout");
test("ignora preços enviados pelo navegador e bloqueia duplicatas", () => {
  assert.equal(quote([{ slug: "galaxy-s25-ultra", amount: 1 }]).amount, 5200);
  assert.throws(() => quote([{ slug: "galaxy-s25-ultra" }, { slug: "galaxy-s25-ultra" }]));
  assert.equal(quote([{ slug: "galaxy-s25-ultra", back: true }], false).amount, 5200);
});
const order = { id: "local-order", amount: 5200, status: "pending", snapshot: { items: [] } };
function paid(amount = 5200) {
  return { id: "or_Test123", code: order.id, amount: 5200, currency: "BRL", status: "paid",
    charges: [{ amount: 5200, payment_method: "pix", status: "paid", paid_amount: amount }] };
}
test("confirma somente pagamento integral correspondente ao pedido", () => {
  assert.equal(providerState(paid(), order).status, "paid");
  assert.equal(providerState(paid(100), order).status, "review");
  assert.throws(() => providerState({ ...paid(), currency: "USD" }, order));
  assert.throws(() => providerState({ ...paid(), code: "outro-pedido" }, order));
});
test("resposta atrasada não desfaz pagamento confirmado", () => {
  const response = paid(0);
  response.status = response.charges[0].status = "pending";
  assert.equal(providerState(response, { ...order, status: "paid" }).status, "paid");
});
test("resposta pública não expõe dados pessoais ou credenciais", () => {
  const result = publicOrder({ ...order, access_hash: "segredo", payload: { customer: { document: "privado" } } });
  assert.equal(result.payload, undefined);
  assert.equal(result.access_hash, undefined);
});
