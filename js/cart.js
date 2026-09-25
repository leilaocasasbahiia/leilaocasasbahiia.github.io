/**
 * Carrinho de lances — gaveta lateral (drawer).
 *
 * Regras:
 *   - sem limite de produtos por CPF (1 unidade de cada, sem seletor);
 *   - itens comprados com o desconto do back ficam marcados como [BACK];
 *   - o estado fica em localStorage e é compartilhado por todas as páginas.
 *
 * Exposto como window.Cart. O checkout.js lê o carrinho para cobrar tudo junto.
 */
window.Cart = (function () {
  "use strict";

  var KEY = "arremata_cart";

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* modo privado */ }
  }
  function formatBRL(v) {
    return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function checkoutUrl() {
    return 'checkout.html?itens=' + encodeURIComponent(items.map(item => item.slug).join(','));
  }

  var items = read();

  function count() { return items.length; }
  function total() { return items.reduce(function (s, i) { return s + (Number(i.price) || 0); }, 0); }
  function has(slug) { return items.some(function (i) { return i.slug === slug; }); }
  function all() { return items.slice(); }

  // Retorna "added" | "exists".
  function add(item) {
    if (!item || !item.slug) return "added";
    if (has(item.slug)) return "exists";
    items.push({
      slug: item.slug,
      title: item.title || "Produto",
      price: Number(item.price) || 0,
      img: item.img || "",
      back: !!item.back
    });
    write();
    sync();
    return "added";
  }
  function remove(slug) {
    items = items.filter(function (i) { return i.slug !== slug; });
    write();
    sync();
  }
  function clear() {
    items = [];
    write();
    sync();
  }

  /* ---------- Drawer (montado uma vez) ---------- */
  var drawer, overlay, bodyEl, totalEl, countEl, footEl, built = false;

  function build() {
    if (built) return;
    built = true;

    overlay = document.createElement("div");
    overlay.className = "cart-drawer-overlay";
    overlay.addEventListener("click", close);

    drawer = document.createElement("aside");
    drawer.className = "cart-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-label", "Seu carrinho");
    drawer.innerHTML =
      '<div class="cart-drawer__head">' +
        '<h2>Seu carrinho <span class="cart-drawer__count"></span></h2>' +
        '<button type="button" class="cart-drawer__close" aria-label="Fechar">' +
          '<svg width="20" height="20"><use href="#icon-close"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="cart-drawer__body"></div>' +
      '<div class="cart-drawer__foot">' +
        '<div class="cart-drawer__total"><span>Total</span><strong>R$ 0,00</strong></div>' +
        '<button type="button" class="cart-drawer__cta">Finalizar e pagar</button>' +
        '<button type="button" class="cart-drawer__continue">Continuar escolhendo</button>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    bodyEl = drawer.querySelector(".cart-drawer__body");
    totalEl = drawer.querySelector(".cart-drawer__total strong");
    countEl = drawer.querySelector(".cart-drawer__count");
    footEl = drawer.querySelector(".cart-drawer__foot");

    drawer.querySelector(".cart-drawer__close").addEventListener("click", close);
    drawer.querySelector(".cart-drawer__continue").addEventListener("click", close);
    drawer.querySelector(".cart-drawer__cta").addEventListener("click", function () {
      if (!items.length) return;
      window.location.href = checkoutUrl();
    });

    // Remover item (delegação).
    bodyEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".cart-item__remove");
      if (!btn) return;
      remove(btn.getAttribute("data-slug"));
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer.classList.contains("is-open")) close();
    });
  }

  function renderDrawer() {
    if (!built) return;
    if (countEl) countEl.textContent = items.length ? "(" + items.length + ")" : "";
    if (!items.length) {
      bodyEl.innerHTML =
        '<div class="cart-empty">' +
          '<svg width="46" height="46"><use href="#icon-cart"/></svg>' +
          '<p>Seu carrinho está vazio.</p>' +
          '<span>Abra um produto e use o botão “Adicionar” para guardá-lo aqui.</span>' +
        '</div>';
      if (footEl) footEl.style.display = "none";
      return;
    }
    if (footEl) footEl.style.display = "";
    bodyEl.innerHTML = items.map(function (i) {
      return '<div class="cart-item">' +
        '<img class="cart-item__img" src="' + escapeHtml(i.img) + '" alt="">' +
        '<div class="cart-item__info">' +
          '<p class="cart-item__title">' + escapeHtml(i.title) +
            (i.back ? ' <span class="cart-item__back">[BACK]</span>' : '') + '</p>' +
          '<p class="cart-item__price">' + formatBRL(i.price) + '</p>' +
        '</div>' +
        '<button type="button" class="cart-item__remove" data-slug="' + escapeHtml(i.slug) + '" aria-label="Remover">' +
          '<svg width="16" height="16"><use href="#icon-close"/></svg>' +
        '</button>' +
      '</div>';
    }).join("");
    if (totalEl) totalEl.textContent = formatBRL(total());
  }

  async function open() {
    try {
      const response = await fetch('catalog.json', {cache:'no-store'});
      if (!response.ok) throw new Error('catalog');
      const catalog = await response.json();
      items = items.flatMap(item => {
        const p = catalog.find(p => p.slug === item.slug);
        return p ? [{slug:p.slug,title:p.title,img:p.img,price:StorePricing.total(p.priceCents)/100,back:false}] : [];
      });
      write();
      updateBadges();
    } catch (_) {
      toast('Não foi possível atualizar os preços. Tente novamente.');
      return;
    }
    build();
    renderDrawer();
    overlay.classList.add("is-open");
    drawer.classList.add("is-open");
    document.body.classList.add("cart-lock");
  }
  function close() {
    if (!built) return;
    overlay.classList.remove("is-open");
    drawer.classList.remove("is-open");
    document.body.classList.remove("cart-lock");
  }

  /* ---------- Badge do header ---------- */
  function updateBadges() {
    var badges = document.querySelectorAll(".header-action--cart .cart-badge");
    Array.prototype.forEach.call(badges, function (b) {
      b.textContent = items.length;
      b.style.display = items.length ? "" : "none";
    });
  }

  function sync() {
    updateBadges();
    renderDrawer();
    // Avisa outras partes da página (ex.: checkout) que o carrinho mudou.
    try { window.dispatchEvent(new CustomEvent("cart:change")); } catch (e) { /* navegadores antigos */ }
  }

  /* ---------- Toast ---------- */
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "cart-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    // força reflow para a transição
    void t.offsetWidth;
    t.classList.add("is-visible");
    setTimeout(function () {
      t.classList.remove("is-visible");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 2600);
  }

  /* ---------- Wiring do ícone de carrinho ---------- */
  function init() {
    var triggers = document.querySelectorAll(".header-action--cart");
    Array.prototype.forEach.call(triggers, function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        open();
      });
    });
    updateBadges();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    add: add,
    remove: remove,
    clear: clear,
    count: count,
    total: total,
    all: all,
    has: has,
    open: open,
    close: close,
    toast: toast,
    format: formatBRL
  };
})();
