(function () {
  "use strict";
  var storageKey = "arremata_pix_pending";
  var form = document.getElementById("checkoutForm");
  var notice = document.getElementById("checkoutNotice");
  var generate = document.getElementById("generatePix");
  var credentials = null, summary = null, current = null, submitting = false, polling = false, pollTimer;
  var quoteSequence = 0;
  var money = function (cents) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); };
  function message(text, error) {
    notice.textContent = text || ""; notice.hidden = !text;
    notice.classList.toggle("is-error", !!error);
  }
  async function api(path, options) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 28000);
    try {
      var response = await fetch(path, Object.assign({ cache: "no-store", signal: controller.signal }, options));
      var data;
      try { data = await response.json(); } catch (_) { throw new Error("O pagamento está indisponível. Tente novamente em instantes."); }
      if (!response.ok) {
        var error = new Error(data.error || "Não foi possível processar o pedido.");
        error.code = data.code; error.status = response.status; throw error;
      }
      return data;
    } catch (error) {
      if (error.name === "AbortError" || error instanceof TypeError) throw new Error("Não foi possível conectar. Tente novamente para consultar o mesmo pedido.");
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function post(path, value) {
    return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  }
  function renderSummary(data, editable) {
    var list = document.getElementById("checkoutItems"); list.replaceChildren();
    data.items.forEach(function (item) {
      var li = document.createElement("li"); li.className = "checkout-item";
      var img = document.createElement("img"); img.src = item.img; img.alt = "";
      var info = document.createElement("div");
      var title = document.createElement("p"); title.textContent = item.title;
      var price = document.createElement("strong"); price.textContent = money(item.amount);
      info.append(title, price);
      if (editable) {
        var remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Remover";
        remove.setAttribute("aria-label", "Remover " + item.title);
        remove.addEventListener("click", function () { if (!submitting && !credentials) { Cart.remove(item.slug); loadQuote(); } });
        info.appendChild(remove);
      }
      li.append(img, info); list.appendChild(li);
    });
    document.getElementById("checkoutTotal").textContent = money(data.amount);
  }
  async function loadQuote() {
    document.body.classList.remove("payment-view");
    var sequence = ++quoteSequence;
    summary = null; generate.disabled = true;
    var items = Cart.all().map(function (p) { return { slug: p.slug, back: p.back === true }; });
    if (!items.length) {
      form.hidden = true; renderSummary({ items: [], amount: 0 }, false);
      message("Seu carrinho está vazio. Volte à loja para escolher os produtos."); return;
    }
    message("Conferindo os preços dos produtos…");
    try {
      var result = await post("/api/quote", { items: items });
      if (sequence !== quoteSequence) return;
      summary = result; renderSummary(summary, true); form.hidden = false;
      generate.textContent = "Gerar Pix de " + money(summary.amount); generate.disabled = false; message("");
    } catch (error) { if (sequence === quoteSequence) message(error.message, true); }
  }
  function saveCredentials(value) {
    // Persist only the opaque order access token, never CPF, address or API credentials.
    sessionStorage.setItem(storageKey, JSON.stringify(value)); credentials = value;
  }
  function forgetCredentials() {
    sessionStorage.removeItem(storageKey); credentials = null;
  }
  function readCustomer() {
    var values = new FormData(form);
    var get = function (key) { return String(values.get(key) || "").trim(); };
    return { name: get("name"), email: get("email"), document: get("document"), phone: get("phone"),
      address: { zipCode: get("zipCode"), state: get("state"), city: get("city"), street: get("street"),
        number: get("number"), district: get("district"), complement: get("complement") } };
  }
  function showRecovery() {
    document.body.classList.add("payment-view");
    form.hidden = true; document.getElementById("pixPanel").hidden = false;
    document.getElementById("pixTitle").textContent = "Consulte seu pedido";
    document.getElementById("orderReference").textContent = credentials.requestId;
    document.getElementById("retryPayment").hidden = false;
    document.getElementById("pixInstructions").hidden = true;
    document.getElementById("newOrder").hidden = true;
  }
  var states = {
    creating: ["Preparando seu Pix", "Estamos recuperando os dados deste pedido. Se necessário, use o botão abaixo para tentar novamente."],
    pending: ["Aguardando pagamento", "Após pagar, a confirmação aparecerá aqui automaticamente."],
    paid: ["Pagamento confirmado", "Recebemos o pagamento do seu pedido. Guarde o número abaixo para acompanhamento com a loja."],
    expired: ["Prazo do Pix encerrado", "Este código não deve mais ser usado. Verifique o pagamento antes de voltar ao carrinho."],
    failed: ["Pagamento não concluído", "A cobrança não foi concluída. Você pode voltar ao carrinho."],
    refunded: ["Pagamento em devolução ou devolvido", "Consulte o aplicativo do seu banco para acompanhar a devolução."],
    review: ["Pagamento em conferência", "O valor recebido precisa ser conferido pela loja. Não faça outro pagamento para este pedido."]
  };
  function showOrder(order) {
    document.body.classList.add("payment-view");
    document.getElementById("pixAmount").textContent = money(order.amount);
    current = order; form.hidden = true; document.getElementById("pixPanel").hidden = false;
    renderSummary(order, false);
    var state = states[order.status] || states.creating;
    document.getElementById("pixTitle").textContent = state[0];
    document.getElementById("pixMessage").textContent = state[1];
    document.getElementById("orderReference").textContent = order.id;
    document.getElementById("testNotice").hidden = !order.testMode;
    var hasCode = order.status === "pending" && !!order.qrCode;
    document.getElementById("pixInstructions").hidden = !hasCode;
    document.getElementById("pixCode").value = hasCode ? order.qrCode : "";
    var image = document.getElementById("pixImage");
    image.hidden = !hasCode || !order.qrCodeUrl;
    if (hasCode && order.qrCodeUrl && image.getAttribute("src") !== order.qrCodeUrl) image.src = order.qrCodeUrl;
    if (!hasCode) image.removeAttribute("src");
    document.getElementById("retryPayment").hidden = order.status !== "creating";
    document.getElementById("newOrder").hidden = !["expired", "failed"].includes(order.status);
    document.getElementById("checkPayment").hidden = ["paid", "refunded"].includes(order.status);
    if (order.status === "paid") {
      // Remove only the purchased products, preserving products added later.
      order.items.forEach(function (item) { Cart.remove(item.slug); });
      form.reset();
    }
    updateExpiry(); schedulePoll();
  }
  function updateExpiry() {
    var label = document.getElementById("pixExpiry");
    if (!current?.expiresAt || current.status !== "pending") { label.textContent = ""; return; }
    var remaining = Math.max(0, Math.ceil((Date.parse(current.expiresAt) - Date.now()) / 1000));
    if (!Number.isFinite(remaining)) { label.textContent = ""; return; }
    label.textContent = remaining > 0 ? "Válido por " + Math.floor(remaining / 60) + ":" + String(remaining % 60).padStart(2, "0") : "Verificando o prazo e o pagamento…";
    if (remaining === 0) document.getElementById("pixInstructions").hidden = true;
  }
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (credentials && current && ["creating", "pending"].includes(current.status)) {
      pollTimer = setTimeout(function () { if (!document.hidden) checkStatus(); else schedulePoll(); }, 10000);
    }
  }
  async function checkStatus() {
    if (!credentials || polling || submitting) return;
    polling = true; document.getElementById("checkPayment").disabled = true;
    try {
      var order = await api("/api/orders?id=" + encodeURIComponent(credentials.requestId), {
        headers: { Authorization: "Bearer " + credentials.accessToken }
      });
      showOrder(order); message(""); return order;
    } catch (error) {
      message(error.message, true);
      // An empty provider lookup may be transient. Never discard an ambiguous attempt.
      if (!current) showRecovery();
      schedulePoll();
    } finally { polling = false; document.getElementById("checkPayment").disabled = false; }
  }
  async function submit(resume) {
    if (submitting || (!resume && (!summary || !form.reportValidity()))) return;
    submitting = true; generate.disabled = true; document.getElementById("retryPayment").disabled = true;
    try {
      var details = resume ? { resume: true } : {
        items: summary.items.map(function (p) { return { slug: p.slug, back: p.back }; }),
        expectedAmount: summary.amount, customer: readCustomer()
      };
      message("Preparando seu Pix. Aguarde…");
      if (!credentials) saveCredentials(await post("/api/orders", Object.assign({ action: "prepare" }, details)));
      var input = Object.assign({}, credentials, details);
      var order = await post("/api/orders", input);
      showOrder(order); message(""); document.getElementById("pixTitle").focus();
    } catch (error) {
      if (!credentials) {
        if (error.code === "price_changed") await loadQuote();
      } else showRecovery();
      message(error.message, true);
    } finally {
      submitting = false; generate.disabled = !summary; document.getElementById("retryPayment").disabled = false;
    }
  }
  form.addEventListener("submit", function (event) { event.preventDefault(); submit(false); });
  document.getElementById("retryPayment").addEventListener("click", function () { submit(true); });
  document.getElementById("checkPayment").addEventListener("click", checkStatus);
  document.getElementById("copyPix").addEventListener("click", async function () {
    var code = document.getElementById("pixCode");
    try {
      await navigator.clipboard.writeText(code.value);
      document.getElementById("copyFeedback").textContent = "Código copiado. Cole na opção Pix do seu banco.";
    } catch (_) {
      code.focus(); code.select();
      document.getElementById("copyFeedback").textContent = "Selecione e copie o código acima.";
    }
  });
  document.getElementById("pixImage").addEventListener("error", function () { this.hidden = true; });
  document.getElementById("newOrder").addEventListener("click", async function () {
    var verified = await checkStatus();
    if (verified && ["expired", "failed"].includes(verified.status)) {
      forgetCredentials(); current = null; document.getElementById("pixPanel").hidden = true; loadQuote();
    }
  });
  window.addEventListener("storage", function (event) { if (event.key === "arremata_cart" && !credentials) location.reload(); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden && credentials) checkStatus(); });
  setInterval(updateExpiry, 1000);
  try {
    var saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (saved?.requestId && saved?.accessToken) credentials = saved;
    // Verify storage support before accepting a payment request.
    sessionStorage.setItem("pix_storage_check", "1"); sessionStorage.removeItem("pix_storage_check");
    if (credentials) checkStatus(); else loadQuote();
  } catch (_) { message("Permita o armazenamento desta página no navegador para continuar o pagamento.", true); }
})();
