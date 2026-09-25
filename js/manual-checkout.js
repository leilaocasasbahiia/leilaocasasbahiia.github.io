(function () {
  "use strict";
  var storageKey = "arremata_manual_pix_v1";
  var form = document.getElementById("checkoutForm"), notice = document.getElementById("checkoutNotice");
  var generate = document.getElementById("generatePix"), summary = null, current = null, customer = null;
  var requestId = null, reported = false, busy = false, sequence = 0;
  function money(cents) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function message(text, error) { notice.textContent = text; notice.hidden = !text; notice.classList.toggle("is-error", !!error); }
  async function post(url, input) {
    var response;
    try {
      response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
    } catch (_) { throw new Error("Não foi possível conectar. Tente gerar o mesmo código novamente."); }
    var data;
    try { data = await response.json(); } catch (_) { throw new Error("Não foi possível gerar o Pix agora."); }
    if (!response.ok) { var error = new Error(data.error || "Não foi possível gerar o Pix."); error.code = data.code; throw error; }
    return data;
  }
  function renderSummary(order, editable) {
    var list = document.getElementById("checkoutItems"); list.replaceChildren();
    order.items.forEach(function (item) {
      var li = document.createElement("li"), img = document.createElement("img"), info = document.createElement("div");
      li.className = "checkout-item"; img.src = item.img; img.alt = "";
      var title = document.createElement("p"), price = document.createElement("strong");
      title.textContent = item.title; price.textContent = money(item.amount); info.append(title, price);
      if (editable) {
        var remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Remover";
        remove.setAttribute("aria-label", "Remover " + item.title);
        remove.addEventListener("click", function () { if (!busy && !current) Cart.remove(item.slug); }); info.append(remove);
      }
      li.append(img, info); list.append(li);
    });
    document.getElementById("checkoutTotal").textContent = money(order.amount);
  }
  async function loadQuote() {
    if (current || busy) return;
    var version = ++sequence;
    summary = null; generate.disabled = true;
    var items = Cart.all().map(function (p) { return { slug: p.slug, back: p.back === true }; });
    if (!items.length) { form.hidden = true; renderSummary({ items: [], amount: 0 }, false); message("Seu carrinho está vazio. Volte à loja para escolher os produtos."); return; }
    message("Conferindo os valores…");
    try {
      var data = await post("/api/quote", { items: items });
      if (version !== sequence) return;
      summary = data; renderSummary(data, true); form.hidden = false; generate.disabled = false;
      generate.textContent = "Gerar Pix de " + money(data.amount); message("");
    } catch (error) { if (version === sequence) message(error.message, true); }
  }
  function readCustomer() {
    var data = new FormData(form), get = function (name) { return String(data.get(name) || "").trim(); };
    return { name: get("name"), email: get("email"), document: get("document"), phone: get("phone"),
      address: { zipCode: get("zipCode"), state: get("state"), city: get("city"), street: get("street"),
        number: get("number"), district: get("district"), complement: get("complement") } };
  }
  function persist() {
    // Session-only recovery. These details are sent to the shop only by the customer's explicit sharing action.
    sessionStorage.setItem(storageKey, JSON.stringify({ requestId: requestId, order: current, customer: customer, reported: reported }));
  }
  function orderText() {
    var a = customer.address;
    return ["RESUMO DA COMPRA — NÃO É COMPROVANTE DE PAGAMENTO", "Referência: " + current.id,
      "Identificador Pix: " + current.txid, "Recebedor: " + current.recipient.name,
      "Situação: " + (reported ? "cliente informou pagamento; aguardando conferência da loja" : "pagamento não verificado"), "",
      ...current.items.map(function (p) { return p.quantity + " × " + p.title + " — " + money(p.amount); }),
      "Frete: grátis", "Total: " + money(current.amount), "", "DADOS PARA ENTREGA", "Nome: " + customer.name,
      "E-mail: " + customer.email, "Telefone: " + customer.phone, "CPF: " + customer.document,
      "Endereço: " + [a.street, a.number, a.complement, a.district, a.city, a.state, a.zipCode].filter(Boolean).join(", "),
      "", "Solicito a conferência do recebimento no banco. Enviarei o comprovante separadamente."].join("\n");
  }
  function renderPayment() {
    document.body.classList.add("payment-view"); form.hidden = true; document.getElementById("pixPanel").hidden = false;
    renderSummary(current, false);
    document.getElementById("orderReference").textContent = current.txid;
    document.getElementById("pixAmount").textContent = money(current.amount);
    document.getElementById("pixRecipient").textContent = current.recipient.name;
    document.getElementById("pixBank").textContent = current.recipient.bank + " · " + current.recipient.city;
    document.getElementById("pixCode").value = current.qrCode;
    var image = document.getElementById("pixImage"); image.src = current.qrCodeUrl; image.hidden = false;
    document.getElementById("pixTitle").textContent = "Pagamento aguardando conferência";
    document.getElementById("pixMessage").textContent = reported
      ? "Você informou nesta aba que já pagou. A loja ainda precisa receber seu resumo e conferir o Pix no banco. Não pague novamente."
      : "Pague uma única vez e envie o resumo e o comprovante à loja. Esta página não consulta o banco nem confirma o recebimento.";
    document.getElementById("pixInstructions").hidden = reported;
    document.getElementById("reportedPayment").hidden = reported;
    document.getElementById("showCode").hidden = !reported;
    document.getElementById("startNewOrder").hidden = !reported;
    document.getElementById("newOrderHint").hidden = !reported;
    document.getElementById("pixExpiry").hidden = true;
    var whatsapp = current.recipient.whatsapp || "", send = document.getElementById("sendOrder");
    if (/^55\d{10,11}$/.test(whatsapp)) {
      send.href = "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent(orderText()); send.hidden = false;
      document.getElementById("manualHandoff").textContent = "Envie o resumo pelo WhatsApp abaixo e anexe o comprovante na conversa. A loja receberá seus dados somente quando você enviar a mensagem.";
    } else { send.hidden = true; }
  }
  form.addEventListener("submit", async function (event) {
    event.preventDefault(); if (busy || !summary || !form.reportValidity() || current) return;
    busy = true; generate.disabled = true; var changed = false;
    try {
      requestId = requestId || crypto.randomUUID(); persist();
      var details = readCustomer();
      message("Gerando seu QR Code Pix…");
      var order = await post("/api/orders", { requestId: requestId, items: summary.items.map(function (p) { return { slug: p.slug, back: p.back }; }), expectedAmount: summary.amount, customer: details });
      if (order.provider !== "manual_pix" || order.status !== "awaiting_manual_confirmation") throw new Error("Resposta de pagamento inesperada. Recarregue a página.");
      current = order; customer = details; reported = false;
      persist(); renderPayment(); message(""); document.getElementById("pixTitle").focus();
    } catch (error) {
      if (current) { renderPayment(); message("Baixe o resumo: não foi possível salvar a recuperação nesta aba.", true); }
      else { message(error.message, true); changed = error.code === "price_changed"; }
    } finally { busy = false; generate.disabled = !summary; if (changed) loadQuote(); }
  });
  document.getElementById("reportedPayment").addEventListener("click", function () {
    if (!current) return; reported = true;
    try { persist(); } catch (_) { message("Baixe o resumo antes de fechar esta aba.", true); }
    renderPayment();
  });
  document.getElementById("showCode").addEventListener("click", function () { document.getElementById("pixInstructions").hidden = false; });
  document.getElementById("startNewOrder").addEventListener("click", function () {
    if (!current || !reported) return;
    current.items.forEach(function (item) { Cart.remove(item.slug); });
    sessionStorage.removeItem(storageKey); current = null; customer = null; requestId = null; reported = false;
    location.href = "index.html";
  });
  document.getElementById("copyPix").addEventListener("click", async function () {
    try { await navigator.clipboard.writeText(current.qrCode); document.getElementById("copyFeedback").textContent = "Código copiado. Confira recebedor e valor no seu banco."; }
    catch (_) { var code = document.getElementById("pixCode"); code.focus(); code.select(); document.getElementById("copyFeedback").textContent = "Selecione e copie o código acima."; }
  });
  document.getElementById("copyOrder").addEventListener("click", async function () {
    try { await navigator.clipboard.writeText(orderText()); document.getElementById("orderFeedback").textContent = "Resumo copiado. Envie para a loja junto do comprovante."; }
    catch (_) { document.getElementById("orderFeedback").textContent = "Use Baixar resumo para salvar e enviar o arquivo à loja."; }
  });
  document.getElementById("downloadOrder").addEventListener("click", function () {
    var url = URL.createObjectURL(new Blob([orderText()], { type: "text/plain;charset=utf-8" }));
    var link = document.createElement("a"); link.href = url; link.download = "pedido-" + current.txid + ".txt";
    document.body.append(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  document.getElementById("pixImage").addEventListener("error", function () { this.hidden = true; });
  window.addEventListener("cart:change", loadQuote);
  window.addEventListener("storage", function (event) { if (event.key === "arremata_cart" && !current) location.reload(); });
  try {
    sessionStorage.setItem("manual_pix_storage_check", "1"); sessionStorage.removeItem("manual_pix_storage_check");
    var saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (saved?.requestId) requestId = saved.requestId;
    if (saved?.order?.provider === "manual_pix" && saved?.customer?.address) {
      current = saved.order; customer = saved.customer; reported = saved.reported === true; renderPayment(); message("");
    } else loadQuote();
  } catch (_) { message("Permita o armazenamento nesta aba para gerar e recuperar seu Pix.", true); }
})();
