/**
 * Back offer — desconto de 50% liberado quando o usuário chega com
 * ?backactivated=true (vindo do popup da página /back).
 *
 * Uma vez ativado, o desconto:
 *   - fica salvo na sessão (sessionStorage) e é propagado na URL dos links,
 *     sobrevivendo à navegação index -> produto -> checkout;
 *   - troca os preços exibidos na listagem e na página de produto;
 *   - garante que o valor cobrado no checkout seja exatamente o da tabela.
 *
 * Incluído ANTES de product.js / checkout.js para que esses scripts já
 * leiam os valores promocionais.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "backoffer_active";
  var params = new URLSearchParams(window.location.search);

  // Ativa via parâmetro na URL ou via flag já salva na sessão.
  var active = params.get("backactivated") === "true";
  try {
    if (active) sessionStorage.setItem(STORAGE_KEY, "1");
    else if (sessionStorage.getItem(STORAGE_KEY) === "1") active = true;
  } catch (e) { /* modo privado: usa só o parâmetro da URL */ }

  // Sinaliza pro carrinho marcar os itens comprados como [BACK].
  window.__backofferActive = active;

  if (!active) return;

  // Preços promocionais (50% OFF) por slug do produto.
  var PRICES = {
    "galaxy-s25-ultra": 26.00,
    "iphone-15-pro-max": 39.00,
    "geladeira-french-door": 44.50,
    "iphone-16-pro-max": 42.50,
    "iphone-17-pro": 44.50,
    "playstation-5-slim": 44.00,
    "ar-condicionado-lg": 40.00,
    "drone-dji-mini": 21.00,
    "guarda-roupa": 27.00,
    "geladeira-brastemp": 26.72,
    "airpods-max": 21.61,
    "filtro-agua-electrolux": 26.66,
    "fogao-electrolux": 38.00,
    "fritadeira-mondial": 34.00,
    "cafeteira-dolce-gusto": 36.20,
    "iphone-15-azul": 22.50,
    "iphone-15-rosa": 26.00,
    "iphone-16": 30.50,
    "parafusadeira-dewalt": 21.00,
    "jbl-boombox-3": 29.00,
    "jbl-boombox-4": 33.50,
    "jbl-partybox-stage320": 39.50,
    "jbl-tour-one": 24.50,
    "jogo-panelas-brinox": 23.00,
    "kit-3-panelas-pressao": 22.00,
    "camera-seguranca-wifi": 27.50,
    "kit-cozinha-cadence": 36.00,
    "poco-x5-5g": 26.50,
    "smart-tv-samsung-43": 40.50
  };

  function formatBRL(value) {
    return "R$ " + value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function decimalComma(value) {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function slugFromHref(href) {
    var m = String(href).match(/product-([a-z0-9-]+)\.html/);
    return m ? m[1] : "";
  }
  function withBackParam(href) {
    if (href.indexOf("backactivated=") !== -1) return href;
    return href + (href.indexOf("?") > -1 ? "&" : "?") + "backactivated=true";
  }

  /* ---------- Listagem (index) ---------- */
  var grid = document.getElementById("cardGrid");
  if (grid) {
    var cards = grid.querySelectorAll(".card");
    Array.prototype.forEach.call(cards, function (card) {
      var link = card.querySelector("a[href^='product-']");
      var slug = link ? slugFromHref(link.getAttribute("href")) : "";
      if (!slug || !(slug in PRICES)) return;
      var price = PRICES[slug];
      card.setAttribute("data-bid", price.toFixed(2));
      var priceEl = card.querySelector(".card__price");
      if (priceEl) priceEl.textContent = formatBRL(price);
      var subEl = card.querySelector(".card__sub");
      if (subEl) subEl.textContent = "Lance mínimo: " + formatBRL(price);
    });
    // Propaga o parâmetro para as páginas de produto.
    var links = grid.querySelectorAll("a[href^='product-']");
    Array.prototype.forEach.call(links, function (a) {
      a.setAttribute("href", withBackParam(a.getAttribute("href")));
    });
  }

  /* ---------- Página de produto (PDP) ---------- */
  var currentBidPrice = document.getElementById("currentBidPrice");
  if (currentBidPrice) {
    var pdpMatch = window.location.pathname.match(/product-([a-z0-9-]+)\.html/);
    var pdpSlug = pdpMatch ? pdpMatch[1] : "";
    if (pdpSlug in PRICES) {
      var pdpPrice = PRICES[pdpSlug];
      currentBidPrice.textContent = formatBRL(pdpPrice);
      var minNext = document.getElementById("minNextBid");
      if (minNext) minNext.textContent = formatBRL(pdpPrice);
      var btnAmount = document.getElementById("bidButtonAmount");
      if (btnAmount) btnAmount.textContent = formatBRL(pdpPrice);
      var bidInput = document.getElementById("bidInput");
      if (bidInput) bidInput.value = decimalComma(pdpPrice);
    }
  }

  /* ---------- Checkout ---------- */
  // Sobrescreve o preço na URL antes do checkout.js lê-lo, garantindo que o
  // resumo, o Pix e a cobrança fiquem no valor promocional.
  if (document.getElementById("ckSummaryPrice")) {
    var ckSlug = params.get("slug") || "";
    if (ckSlug in PRICES) {
      params.set("price", PRICES[ckSlug].toFixed(2));
      var newSearch = "?" + params.toString();
      if (newSearch !== window.location.search) {
        history.replaceState(null, "", window.location.pathname + newSearch + window.location.hash);
      }
    }
  }
})();
