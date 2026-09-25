"use strict";
require("./build");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../public");
const routes = {
  "/api/admin-orders": require("../api/admin-orders"),
  "/api/quote": require("../api/quote"),
  "/api/orders": require("../api/orders"),
  "/api/pagarme-webhook": require("../api/pagarme-webhook")
};
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const handler = routes[url.pathname];
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (handler) {
      let size = 0, chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 20000) { res.writeHead(413); res.end(); return; }
        chunks.push(chunk);
      }
      req.body = Buffer.concat(chunks).toString("utf8");
      return await handler(req, res);
    }
    const file = path.resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end("Página não encontrada."); return;
    }
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  } catch (_) { if (!res.headersSent) res.writeHead(500); res.end("Erro ao processar a solicitação."); }
});
server.listen(Number(process.env.PORT || 3001), "127.0.0.1", () => console.log("Preview: http://127.0.0.1:" + server.address().port));
