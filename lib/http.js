"use strict";
const { CheckoutError, hash } = require("./checkout");
function json(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = status;
  res.end(JSON.stringify(body));
}
function method(req, allowed) {
  if (!allowed.includes(req.method)) throw new CheckoutError(405, "Método não permitido.");
}
function body(req) {
  if (!String(req.headers["content-type"] || "").startsWith("application/json")) throw new CheckoutError(415, "Envie os dados em JSON.");
  let input = req.body;
  if (typeof input === "string" || Buffer.isBuffer(input)) {
    if (Buffer.byteLength(input) > 20000) throw new CheckoutError(413, "Pedido muito grande.");
    try { input = JSON.parse(input); } catch (_) { throw new CheckoutError(400, "Dados inválidos."); }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CheckoutError(400, "Dados inválidos.");
  if (Buffer.byteLength(JSON.stringify(input)) > 20000) throw new CheckoutError(413, "Pedido muito grande.");
  return input;
}
function origin(req) {
  const source = req.headers.origin;
  if (!source) return;
  try { if (new URL(source).host === req.headers.host) return; } catch (_) {}
  throw new CheckoutError(403, "Origem não permitida.");
}
function ipKey(req) {
  return hash(String(req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim());
}
function endpoint(fn, allowed) {
  return async (req, res) => {
    res.setHeader("Allow", allowed.join(", "));
    try { method(req, allowed); await fn(req, res); }
    catch (error) {
      const known = error instanceof CheckoutError;
      if (!known) console.error("checkout_error", error?.code || error?.name || "unknown");
      json(res, known ? error.status : 500, { error: known ? error.message : "Não foi possível processar o pedido agora. Tente novamente.", code: known ? error.code : "internal_error" });
    }
  };
}
module.exports = { json, body, origin, ipKey, endpoint };
