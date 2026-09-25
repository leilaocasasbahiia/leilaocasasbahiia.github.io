const { CheckoutError, secretEquals } = require("../lib/checkout");
const provider = require("../lib/pagarme");
const { endpoint, json, body } = require("../lib/http");
module.exports = endpoint(async (req, res) => {
  const expected = process.env.PAGARME_WEBHOOK_TOKEN;
  if (!expected || expected.length < 32) throw new CheckoutError(503, "Webhook não configurado.");
  const token = new URL(req.url, "http://localhost").searchParams.get("token");
  if (!secretEquals(token, expected)) throw new CheckoutError(401, "Não autorizado.");
  const event = body(req);
  const id = event?.type?.startsWith("order.") ? event.data?.id : event.data?.order?.id;
  // Optional acknowledgement: Pagar.me owns the state; checkout reads it directly.
  if (/^or_[a-zA-Z0-9]+$/.test(id || "")) await provider.get(id);
  json(res, 200, { received: true });
}, ["POST"]);
