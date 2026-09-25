const { service } = require('../lib/saved-orders');
const { getStore } = require('../lib/order-store');
const { createManualPix } = require('../lib/manual-pix');
const { CheckoutError } = require('../lib/checkout');
const { endpoint, origin, body, json, ipKey } = require('../lib/http');
const { limit } = require('../lib/rate-limit');
module.exports = endpoint(async (req, res) => {
  origin(req);
  limit(ipKey(req), 20);
  const input=body(req);
  try {
    const orders=service(getStore());
    return json(res, 200, input.action==='status'?await orders.status(input):await orders.create(input));
  } catch (error) {
    if (error instanceof CheckoutError || input.action==='status') throw error;
    return json(res, 200, {...createManualPix(input),saved:false});
  }
}, ['POST']);
