(function () {
  "use strict";
  var products = [], loaded = false;
  var back = new URLSearchParams(location.search).get("backactivated") === "true";
  try { if (back) sessionStorage.setItem("backoffer_active", "1"); else back = sessionStorage.getItem("backoffer_active") === "1"; } catch (_) {}
  function add(product) {
    var result = Cart.add({ slug: product.slug, title: product.title, img: product.img,
      price: (back ? product.backPriceCents : product.priceCents) / 100, back: back });
    if (result === "exists") Cart.toast("Este produto já está no seu carrinho.");
    Cart.open();
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest(".bid-btn");
    if (!button) return;
    event.preventDefault();
    if (!loaded) { Cart.toast("Aguarde o carregamento dos produtos e tente novamente."); return; }
    var link = button.closest(".card")?.querySelector(".card__thumb");
    var slug = (link?.getAttribute("href") || "").match(/product-([a-z0-9-]+)\.html/);
    var product = products.find(function (p) { return p.slug === slug?.[1]; });
    if (product) add(product);
  });
  fetch("catalog.json", { cache: "no-cache" }).then(function (res) {
    if (!res.ok) throw new Error("Catálogo indisponível."); return res.json();
  }).then(function (data) {
    products = data; loaded = true;
    var detail = document.getElementById("productDetail");
    if (!detail) return;
    var slug = location.pathname.match(/product-([a-z0-9-]+)\.html/)?.[1] || new URLSearchParams(location.search).get("slug");
    var product = products.find(function (p) { return p.slug === slug; });
    var notice = document.getElementById("productNotice");
    if (!product) { notice.textContent = "Produto não encontrado. Volte à loja para escolher outro item."; return; }
    document.title = product.title + " | ZG Negócios Digitais";
    document.getElementById("productTitle").textContent = product.title;
    var img = document.getElementById("productImage"); img.src = product.img; img.alt = product.title;
    document.getElementById("productPrice").textContent = Cart.format((back ? product.backPriceCents : product.priceCents) / 100);
    document.getElementById("productAdd").addEventListener("click", function () { add(product); });
    detail.hidden = false; notice.hidden = true;
    window.dispatchEvent(new CustomEvent("product:ready", { detail: { product: product, products: products, back: back } }));
  }).catch(function () {
    var notice = document.getElementById("productNotice");
    if (notice) notice.textContent = "Não foi possível carregar o produto. Recarregue a página.";
    else Cart.toast("Não foi possível carregar o catálogo. Recarregue a página.");
  });
})();
