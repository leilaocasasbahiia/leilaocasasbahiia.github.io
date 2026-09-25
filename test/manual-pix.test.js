"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { field, crc16, brCode, createManualPix } = require("../lib/manual-pix");
const recipient = require("../pix-config.json");
const input = { requestId: "11111111-1111-4111-8111-111111111111", items: [{ slug: "galaxy-s25-ultra" }], expectedAmount: require("../catalog.json").find(p => p.slug === "galaxy-s25-ultra").priceCents,
  customer: { name: "Pessoa Teste", email: "teste@example.com", document: "52998224725", phone: "11999999999",
    address: { zipCode: "01001000", state: "SP", city: "São Paulo", street: "Praça da Sé", number: "1", district: "Sé" } } };
function parse(text) {
  const fields = {};
  while (text.length) {
    const id = text.slice(0, 2), length = Number(text.slice(2, 4));
    assert.ok(Number.isInteger(length) && length > 0 && text.length >= 4 + length);
    fields[id] = text.slice(4, 4 + length); text = text.slice(4 + length);
  }
  return fields;
}

test('compra usa o preço original e ignora valores enviados pelo cliente', () => {
  const pricing = require('../js/pricing');
  const { quote } = require('../lib/checkout');
  assert.equal(pricing.total(41000), 41000);
  assert.equal(pricing.total(21232), 21232);
  assert.equal(pricing.total(19892), 19892);
  assert.equal(pricing.total(105), 105);
  const slug = 'geladeira-electrolux-it70s-480l';
  const result = quote([{slug, amount:1, priceCents:1, increment:0}]);
  assert.equal(result.amount, 41000);
  assert.equal(quote([{slug, back:true}]).amount, 41000);
  assert.equal(quote([{slug}]).amount, result.amount);
  assert.throws(() => createManualPix({...input, items:[{slug}], expectedAmount:45100}), {code:'price_changed'});
  const pix = createManualPix({...input, items:[{slug}], expectedAmount:41000});
  assert.equal(parse(pix.qrCode)['54'], '410.00');
});
test("CRC16 CCITT-FALSE corresponde ao vetor conhecido", () => {
  assert.equal(crc16("123456789"), "29B1");
  const bcb = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
  assert.equal(crc16(bcb), "1D3D");
});
test("código contém chave correta, valor do catálogo, recebedor e referência", () => {
  const order = createManualPix({ ...input, amount: 1, recipient: { key: "outra-chave" } });
  const fields = parse(order.qrCode), account = parse(fields["26"]);
  assert.equal(account["00"], "br.gov.bcb.pix");
  assert.equal(account["01"], recipient.key);
  assert.equal(fields["54"], (input.expectedAmount / 100).toFixed(2)); assert.equal(fields["53"], "986");
  assert.equal(fields["59"], "ZG NEGOCIOS DIGITAIS LTDA"); assert.equal(fields["60"], "RIO DE JANEIRO");
  assert.equal(parse(fields["62"])["05"], order.txid); assert.match(order.txid, /^[A-Z0-9]{25}$/);
  assert.equal(fields["63"], crc16(order.qrCode.slice(0, -4)));
  assert.equal(order.status, "awaiting_manual_confirmation"); assert.equal(order.expiresAt, null);
  assert.ok(order.qrCodeUrl.startsWith("data:image/svg+xml;base64,"));
  assert.equal(order.customer, undefined);
});
test("mesma referência gera o mesmo Pix, sem API bancária", () => {
  assert.equal(createManualPix(input).qrCode, createManualPix(input).qrCode);
  assert.equal(createManualPix({ ...input, paid: true, status: "paid" }).status, "awaiting_manual_confirmation");
});
test("recusa preço divergente, CPF inválido e referência malformada", () => {
  assert.throws(() => createManualPix({ ...input, expectedAmount: 1 }), { code: "price_changed" });
  assert.throws(() => createManualPix({ ...input, customer: { ...input.customer, document: "00000000000" } }), { code: "invalid_input" });
  assert.throws(() => createManualPix({ ...input, requestId: "<script>" }), { code: "invalid_input" });
  assert.throws(() => brCode({ ...recipient, amount: -1, txid: "ABC" }));
  assert.throws(() => field("59", "X".repeat(100)));
});
