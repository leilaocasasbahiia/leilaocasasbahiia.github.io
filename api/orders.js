const { service } = require('../lib/saved-orders');
const { getStore } = require('../lib/order-store');
const { endpoint, origin, body, json, ipKey } = require('../lib/http');
const { limit } = require('../lib/rate-limit');
module.exports = endpoint(async (req, res) => {
  origin(req);
  limit(ipKey(req), 20);
  const input=body(req);
  const orders=service(getStore());
  json(res, 200, input.action==='status'?await orders.status(input):await orders.create(input));
}, ['POST']);
