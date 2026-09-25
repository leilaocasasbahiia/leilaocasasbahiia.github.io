"use strict";
const { CheckoutError } = require("./checkout");
// Per-instance only. Use hosting firewall rules for a global rate limit.
const buckets = new Map();
function limit(key, maximum, seconds = 60) {
  const now = Date.now();
  for (const [id, bucket] of buckets) if (bucket.expires <= now) buckets.delete(id);
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= 10000) throw new CheckoutError(429, "Aguarde antes de tentar novamente.", "rate_limit");
    bucket = { hits: 0, expires: now + seconds * 1000 }; buckets.set(key, bucket);
  }
  if (++bucket.hits > maximum) throw new CheckoutError(429, "Aguarde um minuto antes de tentar novamente.", "rate_limit");
}
module.exports = { limit };
