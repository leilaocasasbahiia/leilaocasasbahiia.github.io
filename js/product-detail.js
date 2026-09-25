(function () {
  "use strict";
  var imagesPromise = fetch("product-details.json").then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).catch(function () { return {}; });
  window.addEventListener("product:ready", async function (event) {
    var product = event.detail.product, products = event.detail.products, back = event.detail.back;
    document.getElementById("productBreadcrumb").textContent = product.title;
    document.getElementById("productCode").textContent = "Cód. Produto · " + product.slug;
    var details = (await imagesPromise)[product.slug] || {};
    var gallery = details.gallery || [product.img];
    var image = document.getElementById("productImage"), thumbs = document.getElementById("productThumbs");
    gallery.forEach(function (src, index) {
      var button = document.createElement("button"), thumbnail = document.createElement("img");
      button.type = "button"; button.className = "pdp__thumb" + (index === 0 ? " is-active" : "");
      button.setAttribute("aria-label", "Ver foto " + (index + 1)); button.setAttribute("aria-pressed", String(index === 0));
      thumbnail.src = src; thumbnail.alt = "Foto " + (index + 1); thumbnail.loading = "lazy";
      button.append(thumbnail); thumbs.append(button);
      button.addEventListener("click", function () {
        image.src = src;
        thumbs.querySelectorAll("button").forEach(function (item) { item.classList.toggle("is-active", item === button); item.setAttribute("aria-pressed", String(item === button)); });
      });
    });
    image.src = gallery[0];
    (details.description?.length ? details.description : [product.title]).forEach(function (text) {
      var paragraph = document.createElement("p"); paragraph.textContent = text; document.getElementById("descriptionPanel").append(paragraph);
    });
    var related = document.getElementById("relatedProducts");
    products.filter(function (p) { return p.slug !== product.slug; }).slice(0, 4).forEach(function (p) {
      var card = document.createElement("article"); card.className = "card";
      var link = document.createElement("a"); link.className = "card__thumb"; link.href = getUrlWithUtm("product-" + p.slug + ".html");
      var picture = document.createElement("img"); picture.src = p.img; picture.alt = p.title; picture.loading = "lazy"; link.append(picture);
      var body = document.createElement("div"); body.className = "card__body";
      var title = document.createElement("h3"); title.textContent = p.title;
      var price = document.createElement("p"); price.className = "card__price"; price.textContent = Cart.format((back ? p.backPriceCents : p.priceCents) / 100);
      var button = document.createElement("button"); button.type = "button"; button.className = "bid-btn"; button.textContent = "Adicionar ao carrinho";
      body.append(title, price, button); card.append(link, body); related.append(card);
    });
  });
  var tabs = Array.from(document.querySelectorAll("[data-product-tab]"));
  function select(tab) {
    tabs.forEach(function (item) {
      var selected = item === tab; item.classList.toggle("is-active", selected); item.setAttribute("aria-selected", String(selected)); item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.dataset.productTab).hidden = !selected;
    });
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { select(tab); });
    tab.addEventListener("keydown", function (e) {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
      e.preventDefault(); var next = e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      select(next); next.focus();
    });
  });
  document.getElementById("productShare").addEventListener("click", async function () {
    try {
      if (navigator.share) await navigator.share({ title: document.title, url: location.href });
      else { await navigator.clipboard.writeText(location.href); Cart.toast("Link do produto copiado."); }
    } catch (_) { document.getElementById("productFeedback").textContent = "Copie o endereço desta página para compartilhar."; }
  });
  document.getElementById("productZipForm").addEventListener("submit", async function (event) {
    event.preventDefault(); var form = event.currentTarget, zip = form.elements.zip.value.replace(/\D/g, "");
    var result = document.getElementById("productZipResult");
    if (zip.length !== 8) { result.textContent = "Digite um CEP com 8 números."; return; }
    var button = form.querySelector("button"); button.disabled = true; result.textContent = "Consultando endereço…";
    try {
      var response = await fetch("https://viacep.com.br/ws/" + zip + "/json/", { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(); var data = await response.json();
      if (data.erro) { result.textContent = "CEP não encontrado. Confira os números."; return; }
      result.textContent = [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean).join(" · ") + ". Confirme o endereço no checkout.";
    } catch (_) { result.textContent = "Não foi possível consultar. Você pode preencher o endereço no checkout."; }
    finally { button.disabled = false; }
  });
})();
