const { quote } = require("../lib/checkout");
const { endpoint, json, body, origin } = require("../lib/http");
module.exports = endpoint(async (req, res) => {
  origin(req);
  json(res, 200, quote(body(req).items));
}, ["POST"]);
